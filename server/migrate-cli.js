import "dotenv/config";
import pg from "pg";
import { runMigrations } from "./migrate.js";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set in the project .env file.");
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  const applied = await runMigrations(pool);
  console.log(
    applied.length
      ? `Applied database migrations: ${applied.join(", ")}`
      : "Database is already up to date.",
  );
} finally {
  await pool.end();
}
