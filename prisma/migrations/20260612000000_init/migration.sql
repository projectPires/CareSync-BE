-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "LarStatus" AS ENUM ('trial', 'active', 'suspended', 'cancelled');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('monthly', 'annual');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'past_due', 'cancelled');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'nurse', 'aide', 'doctor');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('invited', 'active', 'disabled');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('f', 'm', 'nb', 'not_disclosed');

-- CreateEnum
CREATE TYPE "BloodType" AS ENUM ('a_pos', 'a_neg', 'b_pos', 'b_neg', 'ab_pos', 'ab_neg', 'o_pos', 'o_neg', 'unknown');

-- CreateEnum
CREATE TYPE "ResidentStatus" AS ENUM ('estavel', 'atencao', 'critico', 'recuperacao');

-- CreateEnum
CREATE TYPE "ArchiveReason" AS ENUM ('death', 'discharge', 'transfer', 'other');

-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('morning', 'afternoon', 'night', 'custom');

-- CreateEnum
CREATE TYPE "TaskCategory" AS ENUM ('medicacao', 'higiene', 'alimentacao', 'outro');

-- CreateEnum
CREATE TYPE "MedicationForm" AS ENUM ('comp', 'cap', 'drop', 'patch', 'inj', 'suspension');

-- CreateEnum
CREATE TYPE "MedicationRoute" AS ENUM ('oral', 'sublingual', 'im', 'sc', 'iv', 'topical');

-- CreateEnum
CREATE TYPE "AdministrationStatus" AS ENUM ('pending', 'taken', 'refused', 'delayed', 'missed');

-- CreateEnum
CREATE TYPE "VitalMetric" AS ENUM ('bp', 'hr', 'spo2', 'temp', 'glucose', 'pain');

-- CreateEnum
CREATE TYPE "LogCategory" AS ENUM ('medical', 'nutrition', 'hygiene', 'social');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('critico', 'aviso', 'info');

-- CreateEnum
CREATE TYPE "AlertSource" AS ENUM ('auto', 'manual', 'sensor');

-- CreateEnum
CREATE TYPE "WoundStatus" AS ENUM ('open', 'healing', 'closed');

-- CreateTable
CREATE TABLE "lar" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "nif" TEXT NOT NULL,
    "address" JSONB NOT NULL,
    "floors" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "status" "LarStatus" NOT NULL DEFAULT 'trial',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription" (
    "id" UUID NOT NULL,
    "lar_id" UUID NOT NULL,
    "seats" INTEGER NOT NULL,
    "price_per_seat" DECIMAL(6,2) NOT NULL DEFAULT 1.00,
    "billing_cycle" "BillingCycle" NOT NULL,
    "started_at" DATE NOT NULL,
    "renewal_date" DATE NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "lar_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "pin_hash" TEXT,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "licence_number" TEXT,
    "floors" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "extra_permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "biometric_enabled" BOOLEAN NOT NULL DEFAULT false,
    "status" "UserStatus" NOT NULL DEFAULT 'invited',
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resident" (
    "id" UUID NOT NULL,
    "lar_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "gender" "Gender" NOT NULL,
    "sns_number" TEXT NOT NULL,
    "nif" TEXT,
    "room" TEXT NOT NULL,
    "floor" INTEGER NOT NULL,
    "blood_type" "BloodType" NOT NULL DEFAULT 'unknown',
    "allergies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "chronic_conditions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ResidentStatus" NOT NULL DEFAULT 'estavel',
    "admitted_at" DATE NOT NULL,
    "archived_at" TIMESTAMPTZ,
    "archive_reason" "ArchiveReason",
    "photo_url" TEXT,
    "rgpd_consent" BOOLEAN NOT NULL DEFAULT false,
    "rgpd_consent_at" DATE,
    "emergency_contact" JSONB NOT NULL,
    "assistant_doctor" JSONB,
    "dnr" BOOLEAN NOT NULL DEFAULT false,
    "dnr_document_url" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift" (
    "id" UUID NOT NULL,
    "lar_id" UUID NOT NULL,
    "type" "ShiftType" NOT NULL,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ NOT NULL,
    "floor" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_assignment" (
    "id" UUID NOT NULL,
    "lar_id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "shift_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task" (
    "id" UUID NOT NULL,
    "lar_id" UUID NOT NULL,
    "shift_id" UUID,
    "resident_id" UUID,
    "assigned_to" UUID,
    "title" TEXT NOT NULL,
    "category" "TaskCategory" NOT NULL,
    "scheduled_at" TIMESTAMPTZ NOT NULL,
    "completed_at" TIMESTAMPTZ,
    "completed_by" UUID,
    "recurrence" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medication" (
    "id" UUID NOT NULL,
    "lar_id" UUID NOT NULL,
    "resident_id" UUID NOT NULL,
    "drug" TEXT NOT NULL,
    "dci" TEXT,
    "dose" TEXT NOT NULL,
    "form" "MedicationForm" NOT NULL,
    "route" "MedicationRoute" NOT NULL,
    "schedule" JSONB NOT NULL,
    "condition" TEXT,
    "prescribed_by" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medication_administration" (
    "id" UUID NOT NULL,
    "lar_id" UUID NOT NULL,
    "medication_id" UUID NOT NULL,
    "resident_id" UUID NOT NULL,
    "scheduled_at" TIMESTAMPTZ NOT NULL,
    "administered_at" TIMESTAMPTZ,
    "administered_by" UUID,
    "status" "AdministrationStatus" NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "notes" TEXT,
    "client_id" UUID,
    "supersedes_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medication_administration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vital_reading" (
    "id" UUID NOT NULL,
    "lar_id" UUID NOT NULL,
    "resident_id" UUID NOT NULL,
    "metric" "VitalMetric" NOT NULL,
    "value" JSONB NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL,
    "recorded_by" UUID NOT NULL,
    "abnormal" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "client_id" UUID,
    "supersedes_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vital_reading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_entry" (
    "id" UUID NOT NULL,
    "lar_id" UUID NOT NULL,
    "resident_id" UUID NOT NULL,
    "category" "LogCategory" NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "value" TEXT,
    "notes" TEXT,
    "author_id" UUID NOT NULL,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "client_id" UUID,
    "supersedes_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "log_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert" (
    "id" UUID NOT NULL,
    "lar_id" UUID NOT NULL,
    "resident_id" UUID NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "source" "AlertSource" NOT NULL,
    "title" TEXT NOT NULL,
    "meta" JSONB,
    "icon" TEXT,
    "acknowledged_by" UUID,
    "acknowledged_at" TIMESTAMPTZ,
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wound_record" (
    "id" UUID NOT NULL,
    "lar_id" UUID NOT NULL,
    "resident_id" UUID NOT NULL,
    "location" TEXT NOT NULL,
    "kind" TEXT,
    "grade" INTEGER,
    "status" "WoundStatus" NOT NULL DEFAULT 'open',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wound_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elimination_record" (
    "id" UUID NOT NULL,
    "lar_id" UUID NOT NULL,
    "resident_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "characteristics" JSONB,
    "recorded_by" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL,
    "client_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "elimination_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_record" (
    "id" UUID NOT NULL,
    "lar_id" UUID NOT NULL,
    "resident_id" UUID NOT NULL,
    "activity" TEXT NOT NULL,
    "engagement" INTEGER,
    "mood" TEXT,
    "recorded_by" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL,
    "client_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "lar_id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscription_lar_id_idx" ON "subscription"("lar_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_lar_id_email_key" ON "user"("lar_id", "email");

-- CreateIndex
CREATE INDEX "resident_lar_id_floor_idx" ON "resident"("lar_id", "floor");

-- CreateIndex
CREATE UNIQUE INDEX "resident_lar_id_sns_number_key" ON "resident"("lar_id", "sns_number");

-- CreateIndex
CREATE INDEX "shift_lar_id_starts_at_idx" ON "shift"("lar_id", "starts_at");

-- CreateIndex
CREATE INDEX "shift_assignment_lar_id_idx" ON "shift_assignment"("lar_id");

-- CreateIndex
CREATE UNIQUE INDEX "shift_assignment_shift_id_user_id_key" ON "shift_assignment"("shift_id", "user_id");

-- CreateIndex
CREATE INDEX "task_lar_id_scheduled_at_idx" ON "task"("lar_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "medication_lar_id_resident_id_idx" ON "medication"("lar_id", "resident_id");

-- CreateIndex
CREATE UNIQUE INDEX "medication_administration_client_id_key" ON "medication_administration"("client_id");

-- CreateIndex
CREATE INDEX "medication_administration_lar_id_resident_id_scheduled_at_idx" ON "medication_administration"("lar_id", "resident_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "medication_administration_medication_id_scheduled_at_idx" ON "medication_administration"("medication_id", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "vital_reading_client_id_key" ON "vital_reading"("client_id");

-- CreateIndex
CREATE INDEX "vital_reading_lar_id_resident_id_recorded_at_idx" ON "vital_reading"("lar_id", "resident_id", "recorded_at");

-- CreateIndex
CREATE UNIQUE INDEX "log_entry_client_id_key" ON "log_entry"("client_id");

-- CreateIndex
CREATE INDEX "log_entry_lar_id_resident_id_created_at_idx" ON "log_entry"("lar_id", "resident_id", "created_at");

-- CreateIndex
CREATE INDEX "alert_lar_id_severity_created_at_idx" ON "alert"("lar_id", "severity", "created_at");

-- CreateIndex
CREATE INDEX "wound_record_lar_id_resident_id_idx" ON "wound_record"("lar_id", "resident_id");

-- CreateIndex
CREATE UNIQUE INDEX "elimination_record_client_id_key" ON "elimination_record"("client_id");

-- CreateIndex
CREATE INDEX "elimination_record_lar_id_resident_id_recorded_at_idx" ON "elimination_record"("lar_id", "resident_id", "recorded_at");

-- CreateIndex
CREATE UNIQUE INDEX "activity_record_client_id_key" ON "activity_record"("client_id");

-- CreateIndex
CREATE INDEX "activity_record_lar_id_resident_id_recorded_at_idx" ON "activity_record"("lar_id", "resident_id", "recorded_at");

-- CreateIndex
CREATE INDEX "audit_log_lar_id_created_at_idx" ON "audit_log"("lar_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_lar_id_entity_type_entity_id_idx" ON "audit_log"("lar_id", "entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_lar_id_fkey" FOREIGN KEY ("lar_id") REFERENCES "lar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_lar_id_fkey" FOREIGN KEY ("lar_id") REFERENCES "lar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resident" ADD CONSTRAINT "resident_lar_id_fkey" FOREIGN KEY ("lar_id") REFERENCES "lar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift" ADD CONSTRAINT "shift_lar_id_fkey" FOREIGN KEY ("lar_id") REFERENCES "lar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignment" ADD CONSTRAINT "shift_assignment_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignment" ADD CONSTRAINT "shift_assignment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_resident_id_fkey" FOREIGN KEY ("resident_id") REFERENCES "resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication" ADD CONSTRAINT "medication_resident_id_fkey" FOREIGN KEY ("resident_id") REFERENCES "resident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_administration" ADD CONSTRAINT "medication_administration_medication_id_fkey" FOREIGN KEY ("medication_id") REFERENCES "medication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_administration" ADD CONSTRAINT "medication_administration_resident_id_fkey" FOREIGN KEY ("resident_id") REFERENCES "resident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vital_reading" ADD CONSTRAINT "vital_reading_resident_id_fkey" FOREIGN KEY ("resident_id") REFERENCES "resident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_entry" ADD CONSTRAINT "log_entry_resident_id_fkey" FOREIGN KEY ("resident_id") REFERENCES "resident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert" ADD CONSTRAINT "alert_resident_id_fkey" FOREIGN KEY ("resident_id") REFERENCES "resident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wound_record" ADD CONSTRAINT "wound_record_resident_id_fkey" FOREIGN KEY ("resident_id") REFERENCES "resident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elimination_record" ADD CONSTRAINT "elimination_record_resident_id_fkey" FOREIGN KEY ("resident_id") REFERENCES "resident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_record" ADD CONSTRAINT "activity_record_resident_id_fkey" FOREIGN KEY ("resident_id") REFERENCES "resident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ════════════════════════════════════════════════════════════════════════════
-- CareSync RLS layer (hand-written — prisma-rls-guardian territory)
-- Multi-tenancy: direct policies on lar_id via current_setting('app.current_lar_id').
-- FORCE makes the table OWNER subject to RLS too (the app role owns the tables
-- in dev). Cross-tenant access is reserved to a BYPASSRLS role (back-office, #30).
-- current_setting(..., true) returns NULL when unset → zero rows, never an error.
-- ════════════════════════════════════════════════════════════════════════════

-- Lar itself: tenant sees only its own row.
ALTER TABLE "lar" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lar" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "lar"
  USING (id = current_setting('app.current_lar_id', true)::uuid)
  WITH CHECK (id = current_setting('app.current_lar_id', true)::uuid);

-- Every tenant table: lar_id must match the transaction-local tenant context.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'subscription', 'user', 'resident', 'shift', 'shift_assignment', 'task',
    'medication', 'medication_administration', 'vital_reading', 'log_entry',
    'alert', 'wound_record', 'elimination_record', 'activity_record', 'audit_log'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (lar_id = current_setting(''app.current_lar_id'', true)::uuid)
         WITH CHECK (lar_id = current_setting(''app.current_lar_id'', true)::uuid)',
      t
    );
  END LOOP;
END $$;

-- ── Clinical safety constraints ──────────────────────────────────────────────

-- Hard rule 2: double administration is structurally impossible.
CREATE UNIQUE INDEX "medication_administration_taken_once"
  ON "medication_administration" ("medication_id", "scheduled_at")
  WHERE status = 'taken';

-- ── Audit log: append-only at the database level ─────────────────────────────

CREATE OR REPLACE FUNCTION forbid_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only (no % allowed)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_mutation();

CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_mutation();
