-- #9: delta fetch for the Worker App offline cache. Resident and Medication
-- are mutable, so they need updated_at (the append-only clinical tables use
-- created_at as their change timestamp and need nothing). A DB trigger keeps
-- updated_at correct regardless of how the UPDATE arrives (Prisma @updatedAt is
-- belt; this is braces).

ALTER TABLE "resident" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "medication" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER resident_set_updated_at
  BEFORE UPDATE ON "resident"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER medication_set_updated_at
  BEFORE UPDATE ON "medication"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Delta hot path: changed records since a cursor, per Lar.
CREATE INDEX "resident_lar_id_updated_at_idx" ON "resident" ("lar_id", "updated_at");
CREATE INDEX "medication_lar_id_updated_at_idx" ON "medication" ("lar_id", "updated_at");
