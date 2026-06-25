-- #38 (wounds): WoundEvolution — append-only timeline of UPP evolutions for a
-- wound (§6 M7). WoundRecord stays the wound identity with a MUTABLE status
-- (open→healing→closed); the clinical readings (grade/size/dressing/photo) are
-- the append-only entity (clinical hard rule 1, "wound evolutions"). This is the
-- model the #11 wounds module builds on. forbid_clinical_mutation() already
-- exists (20260615000000).

-- CreateTable
CREATE TABLE "wound_evolution" (
    "id" UUID NOT NULL,
    "lar_id" UUID NOT NULL,
    "wound_id" UUID NOT NULL,
    "grade" INTEGER NOT NULL,
    "size" TEXT,
    "dressing" TEXT,
    "trend" TEXT,
    "photo_key" TEXT,
    "notes" TEXT,
    "recorded_by" UUID NOT NULL,
    "supersedes_id" UUID,
    "reason" TEXT,
    "client_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wound_evolution_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "wound_evolution_lar_id_wound_id_created_at_idx"
  ON "wound_evolution"("lar_id", "wound_id", "created_at");

-- Sync idempotency: client_id unique PER TENANT (not global), partial because
-- online writes carry no client_id (same pattern as the other sync tables).
CREATE UNIQUE INDEX "wound_evolution_lar_client_id"
  ON "wound_evolution"("lar_id", "client_id")
  WHERE "client_id" IS NOT NULL;

-- FK to the wound identity (same ON DELETE RESTRICT / ON UPDATE CASCADE as siblings).
ALTER TABLE "wound_evolution"
  ADD CONSTRAINT "wound_evolution_wound_id_fkey"
  FOREIGN KEY ("wound_id") REFERENCES "wound_record"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── RLS: tenant isolation by lar_id (same policy shape as the init migration) ──
ALTER TABLE "wound_evolution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wound_evolution" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "wound_evolution"
  USING (lar_id = NULLIF(current_setting('app.current_lar_id', true), '')::uuid)
  WITH CHECK (lar_id = NULLIF(current_setting('app.current_lar_id', true), '')::uuid);

-- ── Append-only (clinical hard rule 1) ───────────────────────────────────────
CREATE TRIGGER wound_evolution_no_update
  BEFORE UPDATE ON "wound_evolution"
  FOR EACH ROW EXECUTE FUNCTION forbid_clinical_mutation();
CREATE TRIGGER wound_evolution_no_delete
  BEFORE DELETE ON "wound_evolution"
  FOR EACH ROW EXECUTE FUNCTION forbid_clinical_mutation();

-- Belt + braces on the runtime role: this is a NEW table, so grant the app the
-- privileges it needs (provisioning DEFAULT PRIVILEGES may already cover it —
-- the GRANT is then a harmless no-op), then strip UPDATE/DELETE.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'caresync_app') THEN
    GRANT SELECT, INSERT ON "wound_evolution" TO caresync_app;
    -- DELETE + TRUNCATE both revoked: a BEFORE DELETE trigger does NOT fire on
    -- TRUNCATE, so REVOKE TRUNCATE is required to keep the table truly immutable.
    -- (The pre-existing append-only tables need the same in a hardening migration.)
    REVOKE UPDATE, DELETE, TRUNCATE ON "wound_evolution" FROM caresync_app;
  END IF;
END $$;
