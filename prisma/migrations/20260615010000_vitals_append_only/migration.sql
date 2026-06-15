-- Vitals (#8): make vital_reading append-only at the DB level and add the
-- per-metric history index. Reuses forbid_clinical_mutation() introduced for
-- medication_administration in 20260615000000_emar_append_only (CREATE OR
-- REPLACE keeps this migration self-contained / idempotent).

CREATE OR REPLACE FUNCTION forbid_clinical_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only (no % — rectify with a new row + supersedes_id + reason)',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vital_reading_no_update
  BEFORE UPDATE ON "vital_reading"
  FOR EACH ROW EXECUTE FUNCTION forbid_clinical_mutation();

CREATE TRIGGER vital_reading_no_delete
  BEFORE DELETE ON "vital_reading"
  FOR EACH ROW EXECUTE FUNCTION forbid_clinical_mutation();

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'caresync_app') THEN
    REVOKE UPDATE, DELETE ON "vital_reading" FROM caresync_app;
  END IF;
END $$;

-- Hot path: vitals history filtered by metric within a time window (#8).
CREATE INDEX "vital_reading_lar_id_resident_id_metric_idx"
  ON "vital_reading" ("lar_id", "resident_id", "metric", "recorded_at" DESC);
