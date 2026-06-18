-- #7 (sync) follow-through: the offline-sync idempotency key must be UNIQUE per
-- tenant, not globally. 20260615030000 fixed medication_administration and
-- vital_reading but left the other three sync-capable tables on the global
-- client_id unique. A device client_id (uuid) scoped to lar_id prevents a
-- (pathological) cross-tenant uuid reuse from silently suppressing a valid
-- mutation in the wrong Lar. Partial (WHERE client_id IS NOT NULL) because
-- online HTTP writes carry no client_id and must allow many NULLs.

-- log_entry
DROP INDEX "log_entry_client_id_key";
CREATE UNIQUE INDEX "log_entry_lar_client_id"
  ON "log_entry" ("lar_id", "client_id")
  WHERE "client_id" IS NOT NULL;

-- elimination_record
DROP INDEX "elimination_record_client_id_key";
CREATE UNIQUE INDEX "elimination_record_lar_client_id"
  ON "elimination_record" ("lar_id", "client_id")
  WHERE "client_id" IS NOT NULL;

-- activity_record
DROP INDEX "activity_record_client_id_key";
CREATE UNIQUE INDEX "activity_record_lar_client_id"
  ON "activity_record" ("lar_id", "client_id")
  WHERE "client_id" IS NOT NULL;
