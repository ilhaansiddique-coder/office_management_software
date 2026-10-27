import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultMigrationsDirectory = fileURLToPath(
  new URL("../db/migrations/", import.meta.url),
);

const loadMigrations = async (directory) => {
  const filenames = (await readdir(directory))
    .filter((filename) => filename.endsWith(".sql"))
    .sort();

  if (filenames.some((filename) => !/^\d{4,}_[a-z0-9_]+\.sql$/.test(filename))) {
    throw new Error("Migration filenames must use the format NNNN_description.sql.");
  }

  return Promise.all(
    filenames.map(async (filename) => {
      const sql = await readFile(path.join(directory, filename), "utf8");
      return {
        filename,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex"),
      };
    }),
  );
};

export const runMigrations = async (
  pool,
  migrationsDirectory = defaultMigrationsDirectory,
) => {
  const migrations = await loadMigrations(migrationsDirectory);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [1836210545]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.app_schema_migrations (
        filename text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const result = await client.query(
      "SELECT filename, checksum FROM public.app_schema_migrations",
    );
    const applied = new Map(result.rows.map(({ filename, checksum }) => [filename, checksum]));
    const newlyApplied = [];

    for (const migration of migrations) {
      const existingChecksum = applied.get(migration.filename);
      if (existingChecksum) {
        if (existingChecksum !== migration.checksum) {
          throw new Error(`Applied migration was changed: ${migration.filename}`);
        }
        continue;
      }

      await client.query(migration.sql);
      await client.query(
        "INSERT INTO public.app_schema_migrations (filename, checksum) VALUES ($1, $2)",
        [migration.filename, migration.checksum],
      );
      newlyApplied.push(migration.filename);
    }

    await client.query("COMMIT");
    return newlyApplied;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "Database migration failed and its transaction could not be rolled back.",
      );
    }
    throw error;
  } finally {
    client.release();
  }
};
