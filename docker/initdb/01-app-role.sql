-- Runs ONCE on first container init (empty volume).
-- The app must NEVER connect as the superuser ("caresync") — superusers bypass
-- RLS entirely. "caresync_app" is the runtime role: NOSUPERUSER + NOBYPASSRLS,
-- so every tenant-table query goes through the lar_id policies.
-- Migrations keep running as "caresync" (table owner).

CREATE ROLE caresync_app
  LOGIN PASSWORD 'caresync_app'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

GRANT CONNECT ON DATABASE caresync TO caresync_app;
GRANT USAGE ON SCHEMA public TO caresync_app;

-- Tables are created later by migrations (as "caresync") — default privileges
-- make every future table/sequence usable by the app role.
ALTER DEFAULT PRIVILEGES FOR ROLE caresync IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO caresync_app;
ALTER DEFAULT PRIVILEGES FOR ROLE caresync IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO caresync_app;
