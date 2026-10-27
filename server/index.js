import "dotenv/config";
import { createServer } from "node:http";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import pg from "pg";
import { runMigrations } from "./migrate.js";

const { Pool } = pg;
const scrypt = promisify(scryptCallback);
const port = Number(process.env.LOCAL_API_PORT || 3001);
const host = process.env.LOCAL_API_HOST || "127.0.0.1";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set in the project .env file.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await runMigrations(pool);

const sendJson = (response, status, body) => {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(body));
};

const readJson = async (request) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
};

const tokenHash = (token) => createHash("sha256").update(token).digest("hex");

const passwordMatches = async (password, stored) => {
  const [algorithm, salt, expectedHex] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = await scrypt(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

const currentUser = async (request) => {
  const authorization = request.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return null;

  const result = await pool.query(
    `SELECT u.id, u.email, u.full_name
     FROM local_auth.sessions s
     JOIN local_auth.users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash(token)],
  );
  return result.rows[0] || null;
};

const routes = new Map([
  ["GET /api/health", async (_request, response) => {
    const result = await pool.query("SELECT current_database() AS database");
    sendJson(response, 200, { ok: true, database: result.rows[0].database });
  }],
  ["POST /api/auth/sign-in", async (request, response) => {
    const { loginId, password } = await readJson(request);
    if (typeof loginId !== "string" || typeof password !== "string") {
      return sendJson(response, 400, { error: "User ID and password are required." });
    }

    const result = await pool.query(
      `SELECT id, login_id, email, full_name, password_hash
       FROM local_auth.users
       WHERE lower(login_id) = lower($1) OR lower(email) = lower($1)
       LIMIT 1`,
      [loginId.trim()],
    );
    const account = result.rows[0];
    if (!account || !(await passwordMatches(password, account.password_hash))) {
      return sendJson(response, 401, { error: "Invalid email or password." });
    }

    const token = randomBytes(32).toString("base64url");
    await pool.query(
      `INSERT INTO local_auth.sessions (token_hash, user_id, expires_at)
       VALUES ($1, $2, now() + interval '14 days')`,
      [tokenHash(token), account.id],
    );
    sendJson(response, 200, {
      access_token: token,
      token_type: "bearer",
      expires_in: 14 * 24 * 60 * 60,
      user: {
        id: account.id,
        email: account.email,
        user_metadata: { full_name: account.full_name },
      },
    });
  }],
  ["GET /api/auth/session", async (request, response) => {
    const user = await currentUser(request);
    if (!user) return sendJson(response, 200, { session: null, user: null });
    const token = request.headers.authorization.slice(7);
    const authUser = {
      id: user.id,
      email: user.email,
      user_metadata: { full_name: user.full_name },
    };
    sendJson(response, 200, {
      session: { access_token: token, user: authUser },
      user: authUser,
    });
  }],
  ["GET /api/auth/role", async (request, response) => {
    const user = await currentUser(request);
    if (!user) return sendJson(response, 401, { error: "Authentication required." });
    const result = await pool.query(
      "SELECT role FROM public.user_roles WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
      [user.id],
    );
    sendJson(response, 200, { role: result.rows[0]?.role || null });
  }],
  ["GET /api/auth/role-permissions", async (request, response) => {
    const user = await currentUser(request);
    if (!user) return sendJson(response, 401, { error: "Authentication required." });
    const role = await pool.query(
      "SELECT role FROM public.user_roles WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
      [user.id],
    );
    if (!role.rows[0]) return sendJson(response, 200, { permissions: [] });
    const result = await pool.query(
      "SELECT permission_key, allowed FROM public.role_permissions WHERE role = $1",
      [role.rows[0].role],
    );
    sendJson(response, 200, { permissions: result.rows });
  }],
  ["GET /api/auth/admin-exists", async (_request, response) => {
    const result = await pool.query(
      "SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') AS exists",
    );
    sendJson(response, 200, { exists: result.rows[0].exists });
  }],
  ["POST /api/auth/sign-out", async (request, response) => {
    const authorization = request.headers.authorization || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (token) {
      await pool.query("DELETE FROM local_auth.sessions WHERE token_hash = $1", [tokenHash(token)]);
    }
    sendJson(response, 200, { ok: true });
  }],
]);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    const route = routes.get(`${request.method} ${url.pathname}`);
    if (!route) return sendJson(response, 404, { error: "Local API route not found." });
    await route(request, response);
  } catch (error) {
    console.error("Local API request failed:", error);
    if (!response.headersSent) sendJson(response, 500, { error: "Local API request failed." });
    else response.destroy();
  }
});

server.listen(port, host, () => {
  console.log(`Local PostgreSQL API listening on http://${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => pool.end().finally(() => process.exit(0)));
  });
}
