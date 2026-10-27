CREATE SCHEMA IF NOT EXISTS local_auth;

CREATE TABLE IF NOT EXISTS local_auth.users (
  id uuid PRIMARY KEY,
  login_id text NOT NULL UNIQUE,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE local_auth.users
  ADD COLUMN IF NOT EXISTS login_id text;

UPDATE local_auth.users
SET login_id = email
WHERE login_id IS NULL;

ALTER TABLE local_auth.users
  ALTER COLUMN login_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS local_auth_users_login_id_idx
  ON local_auth.users (lower(login_id));

CREATE TABLE IF NOT EXISTS local_auth.sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES local_auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS local_auth_sessions_expires_at_idx
  ON local_auth.sessions (expires_at);
