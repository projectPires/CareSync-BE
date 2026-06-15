-- eMAR (#6): make medication_administration append-only at the DB level,
-- guarantee scheduler idempotency, and give the cross-tenant scheduler a
-- narrow read of active Lares. Mirrors the audit_log pattern in the init
-- migration. (vital_reading / log_entry get the same treatment in their own
-- issues — #8 / Sprint 2 — so each PR stays scoped.)

-- ── Clinical entities are append-only (clinical hard rule 1) ─────────────────
-- The administration lifecycle (pending→taken|refused|delayed→missed) is
-- implemented as NEW rows + supersedes_id, never in-place UPDATE — so a
-- no-UPDATE trigger never fires on the happy path but blocks any accidental
-- mutation (offline replay, future raw SQL, a stray prisma.update).

CREATE OR REPLACE FUNCTION forbid_clinical_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only (no % — rectify with a new row + supersedes_id + reason)',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER medication_administration_no_update
  BEFORE UPDATE ON "medication_administration"
  FOR EACH ROW EXECUTE FUNCTION forbid_clinical_mutation();

CREATE TRIGGER medication_administration_no_delete
  BEFORE DELETE ON "medication_administration"
  FOR EACH ROW EXECUTE FUNCTION forbid_clinical_mutation();

-- Belt + braces: the runtime role also loses the UPDATE/DELETE grants.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'caresync_app') THEN
    REVOKE UPDATE, DELETE ON "medication_administration" FROM caresync_app;
  END IF;
END $$;

-- ── Scheduler idempotency (clinical hard rule 8) ─────────────────────────────
-- At most one pending row per (medication_id, scheduled_at). The materialiser
-- inserts with ON CONFLICT DO NOTHING against this index, so re-runs and
-- overlapping scheduler ticks never duplicate. Complements the existing
-- taken_once index — superseded rows (refused/delayed/missed) match neither.
CREATE UNIQUE INDEX "medication_administration_pending_once"
  ON "medication_administration" ("medication_id", "scheduled_at")
  WHERE status = 'pending';

-- ── Cross-tenant scheduler: enumerate active Lares ───────────────────────────
-- BullMQ jobs run with no HTTP/tenant context, but `lar` has RLS + FORCE.
-- Narrow escape hatch (same pattern as auth_user_by_id): a SECURITY DEFINER
-- function owned by caresync_auth (BYPASSRLS). The scheduler reads the Lar list
-- via this function, then uses forTenant(prisma, larId) per Lar for every
-- mutation — so each insert still goes through RLS WITH CHECK.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'caresync_auth') THEN
    CREATE ROLE caresync_auth NOLOGIN BYPASSRLS;
  END IF;
END $$;

GRANT SELECT ON "lar" TO caresync_auth;

CREATE OR REPLACE FUNCTION system_active_lar_ids()
RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$ SELECT id FROM "lar" WHERE status IN ('trial', 'active') $$;

ALTER FUNCTION system_active_lar_ids() OWNER TO caresync_auth;

REVOKE ALL ON FUNCTION system_active_lar_ids() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'caresync_app') THEN
    GRANT EXECUTE ON FUNCTION system_active_lar_ids() TO caresync_app;
  END IF;
END $$;
