import "dotenv/config";
import { randomUUID, randomBytes, scrypt as scryptCallback } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import pg from "pg";
import { runMigrations } from "./migrate.js";

const { Pool } = pg;
const scrypt = promisify(scryptCallback);
const adminPassword = process.env.LOCAL_ADMIN_PASSWORD;
const demoPassword = process.env.LOCAL_DEMO_PASSWORD;

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set in .env.");
if (!adminPassword || !demoPassword) {
  throw new Error("Set LOCAL_ADMIN_PASSWORD and LOCAL_DEMO_PASSWORD for this command.");
}
if (adminPassword.length < 6 || demoPassword.length < 6) {
  throw new Error("Local account passwords must be at least 6 characters.");
}

const hashPassword = async (password) => {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${hash.toString("hex")}`;
};

const accounts = [
  {
    loginId: "proxadbd@gmail.com",
    email: "proxadbd@gmail.com",
    fullName: "Administrator",
    role: "admin",
    password: adminPassword,
  },
  {
    loginId: "demo",
    email: "demo@local.invalid",
    fullName: "Demo User",
    role: "staff",
    password: demoPassword,
  },
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await runMigrations(pool);
const client = await pool.connect();

try {
  await client.query("BEGIN");

  for (const account of accounts) {
    const existing = await client.query(
      `SELECT id FROM local_auth.users WHERE lower(login_id) = lower($1)
       UNION
       SELECT id FROM public.profiles WHERE lower(email) = lower($2)
       LIMIT 1`,
      [account.loginId, account.email],
    );
    const id = existing.rows[0]?.id || randomUUID();
    const passwordHash = await hashPassword(account.password);

    await client.query(
      `INSERT INTO local_auth.users (id, login_id, email, full_name, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE
       SET login_id = EXCLUDED.login_id, email = EXCLUDED.email,
           full_name = EXCLUDED.full_name, password_hash = EXCLUDED.password_hash`,
      [id, account.loginId, account.email, account.fullName, passwordHash],
    );
    await client.query(
      `INSERT INTO public.profiles (id, email, full_name, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE
       SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, role = EXCLUDED.role, updated_at = now()`,
      [id, account.email, account.fullName, account.role],
    );
    await client.query(
      `INSERT INTO public.user_roles (user_id, role)
       VALUES ($1, $2::public.user_role)
       ON CONFLICT (user_id) DO UPDATE
       SET role = EXCLUDED.role, updated_at = now()`,
      [id, account.role],
    );
  }

  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}

const credentials = [
  "LOCAL DATABASE LOGIN CREDENTIALS",
  `Created: ${new Date().toISOString()}`,
  "Keep this file private. Change the temporary passwords after first sign-in.",
  "",
  `Admin ID: ${accounts[0].loginId}`,
  `Admin password: ${accounts[0].password}`,
  "Admin role: admin",
  "",
  `Demo ID: ${accounts[1].loginId}`,
  `Demo password: ${accounts[1].password}`,
  "Demo role: staff",
  "",
  "Sign in at the app's local login page. Do not commit or share this file.",
  "",
].join("\n");

await writeFile(new URL("../local-credentials.txt", import.meta.url), credentials, {
  encoding: "utf8",
  mode: 0o600,
});

console.log("Local admin and demo accounts are ready.");
console.log("Credentials saved to local-credentials.txt (excluded from Git).");
