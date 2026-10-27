import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runMigrations } from "./migrate.js";

const temporaryDirectories = [];

const createMigrationDirectory = async (files) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "office-management-migrations-"));
  temporaryDirectories.push(directory);
  await Promise.all(
    Object.entries(files).map(async ([filename, sql]) => {
      await writeFile(path.join(directory, filename), sql, "utf8");
    }),
  );
  return directory;
};

const createFakePool = () => {
  const applied = new Map();
  const executedSql = [];
  let released = false;
  let rollbackCalled = false;

  return {
    applied,
    executedSql,
    get released() {
      return released;
    },
    get rollbackCalled() {
      return rollbackCalled;
    },
    async connect() {
      return {
        async query(sql, parameters = []) {
          const normalizedSql = sql.trim();
          if (normalizedSql.startsWith("SELECT filename, checksum")) {
            return {
              rows: [...applied].map(([filename, checksum]) => ({ filename, checksum })),
            };
          }
          if (normalizedSql.startsWith("INSERT INTO public.app_schema_migrations")) {
            applied.set(parameters[0], parameters[1]);
          } else if (
            normalizedSql === "BEGIN" ||
            normalizedSql === "COMMIT" ||
            normalizedSql === "ROLLBACK"
          ) {
            if (normalizedSql === "ROLLBACK") rollbackCalled = true;
            return { rows: [] };
          } else if (
            normalizedSql.startsWith("CREATE TABLE IF NOT EXISTS public.app_schema_migrations") ||
            normalizedSql.startsWith("SELECT pg_advisory_xact_lock")
          ) {
            return { rows: [] };
          } else {
            executedSql.push(normalizedSql);
          }
          return { rows: [] };
        },
        release() {
          released = true;
        },
      };
    },
  };
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("database migrations", () => {
  it("applies pending migrations in filename order and skips them afterward", async () => {
    const directory = await createMigrationDirectory({
      "0002_add_sessions.sql": "CREATE TABLE sessions (id integer);",
      "0001_create_users.sql": "CREATE TABLE users (id integer);",
    });
    const pool = createFakePool();

    await expect(runMigrations(pool, directory)).resolves.toEqual([
      "0001_create_users.sql",
      "0002_add_sessions.sql",
    ]);
    await expect(runMigrations(pool, directory)).resolves.toEqual([]);

    expect(pool.executedSql).toEqual([
      "CREATE TABLE users (id integer);",
      "CREATE TABLE sessions (id integer);",
    ]);
    expect(pool.released).toBe(true);
  });

  it("rejects edits to already-applied migrations and rolls back", async () => {
    const directory = await createMigrationDirectory({
      "0001_create_users.sql": "CREATE TABLE users (id integer);",
    });
    const pool = createFakePool();
    pool.applied.set("0001_create_users.sql", "previous-checksum");

    await expect(runMigrations(pool, directory)).rejects.toThrow(
      "Applied migration was changed: 0001_create_users.sql",
    );
    expect(pool.rollbackCalled).toBe(true);
    expect(pool.released).toBe(true);
  });

  it("rejects migration filenames without a numeric prefix and description", async () => {
    const directory = await createMigrationDirectory({
      "initial.sql": "SELECT 1;",
    });
    const pool = createFakePool();

    await expect(runMigrations(pool, directory)).rejects.toThrow(
      "Migration filenames must use the format NNNN_description.sql.",
    );
    expect(pool.released).toBe(false);
  });
});
