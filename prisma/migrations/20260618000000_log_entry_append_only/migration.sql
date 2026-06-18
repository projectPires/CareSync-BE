-- Clinical hard rule 1: log_entry is named append-only but never got the
-- DB-level enforcement that medication_administration (20260615000000) and
-- vital_reading (20260615010000) have. Close the gap. log_entry already carries
-- supersedes_id + reason, so the rule-1 rectification pattern (new row +
-- supersedes_id + reason) works unchanged — these triggers only block
-- in-place UPDATE/DELETE. forbid_clinical_mutation() is already defined.
--
-- Scope is log_entry ONLY, deliberately:
--   • wound_record    — has a MUTABLE status (open→healing→closed) and no
--                       supersedes_id; a no-UPDATE trigger would break its
--                       lifecycle. Rule-1 "wound evolutions" needs a dedicated
--                       append-only WoundEvolution sub-table first (Sprint 2).
--   • elimination_record / activity_record — not named in rule 1 and have no
--                       supersedes_id/reason correction columns yet; defer
--                       append-only enforcement until their write paths +
--                       correction semantics are designed (Sprint 2).

CREATE TRIGGER log_entry_no_update
  BEFORE UPDATE ON "log_entry"
  FOR EACH ROW EXECUTE FUNCTION forbid_clinical_mutation();

CREATE TRIGGER log_entry_no_delete
  BEFORE DELETE ON "log_entry"
  FOR EACH ROW EXECUTE FUNCTION forbid_clinical_mutation();

-- Belt + braces: the runtime role also loses the UPDATE/DELETE grants.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'caresync_app') THEN
    REVOKE UPDATE, DELETE ON "log_entry" FROM caresync_app;
  END IF;
END $$;
