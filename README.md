# office_management_software

## Local PostgreSQL development

1. Install PostgreSQL and create the `inventory_office_mngmnt` database.
2. Set `DATABASE_URL` in the ignored project-root `.env` file.
3. Run `npm run dev`. This starts the local API on `127.0.0.1:3001` and Vite on port 8080 (or the next available port).
4. Open `/auth` and sign in with a local account.

Local login accounts are stored in `local_auth`; application profile and role records are stored in `public.profiles` and `public.user_roles`. The one-time setup command is `npm run accounts:setup`, which requires `LOCAL_ADMIN_PASSWORD` and `LOCAL_DEMO_PASSWORD` to be supplied in the process environment. It updates the private, Git-ignored `local-credentials.txt` file.

The local sign-in and role checks use PostgreSQL. Other application data queries and integrations still contain Supabase-dependent code and have not yet been migrated; deleting the Supabase project folder does not replace those integrations.

## Database migrations

Versioned PostgreSQL migrations live in `db/migrations/` and use the filename format `NNNN_description.sql`. The API runs pending migrations on startup; they can also be applied explicitly with `npm run db:migrate`. Applied migration files are checksum-verified and must not be edited—add a new migration for schema changes. The initial migration currently covers local authentication only; application tables and Supabase-dependent features still need to be migrated.

## Validation

Run `npm run lint`, `npm test`, and `npm run build` before submitting changes. CI runs the same checks for pushes to `main` and pull requests.
