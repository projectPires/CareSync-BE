-- #7 (sync): the offline-sync idempotency key must be UNIQUE per tenant, not
-- globally. A device client_id (uuid) is the dedup key; scoping it to lar_id
-- prevents a (pathological) cross-tenant uuid reuse from silently suppressing a
-- valid mutation in the wrong Lar. Partial (WHERE client_id IS NOT NULL) because
-- online HTTP writes carry no client_id and must allow many NULLs.

-- medication_administration: replace global unique with tenant-scoped partial unique.
DROP INDEX "medication_administration_client_id_key";
CREATE UNIQUE INDEX "medication_administration_lar_client_id"
  ON "medication_administration" ("lar_id", "client_id")
  WHERE "client_id" IS NOT NULL;

-- vital_reading: same.
DROP INDEX "vital_reading_client_id_key";
CREATE UNIQUE INDEX "vital_reading_lar_client_id"
  ON "vital_reading" ("lar_id", "client_id")
  WHERE "client_id" IS NOT NULL;
