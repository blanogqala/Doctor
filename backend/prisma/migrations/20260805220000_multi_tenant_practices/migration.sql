-- Multi-tenant Practice foundation

CREATE TYPE "subscription_status" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED');

CREATE TABLE "practices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subdomain" TEXT NOT NULL,
    "clinic_name" TEXT NOT NULL,
    "logo_url" TEXT,
    "brand_color" VARCHAR(7) NOT NULL DEFAULT '#1E40AF',
    "subscription_status" "subscription_status" NOT NULL DEFAULT 'TRIAL',
    "trial_ends_at" TIMESTAMP(3),
    "subscription_ends_at" TIMESTAMP(3),
    "setup_fee_paid" BOOLEAN NOT NULL DEFAULT false,
    "monthly_fee_cents" INTEGER NOT NULL DEFAULT 80000,
    "domain_custom" TEXT,
    "soft_deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "practices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "practices_subdomain_key" ON "practices"("subdomain");
CREATE UNIQUE INDEX "practices_domain_custom_key" ON "practices"("domain_custom");

CREATE TABLE "super_admins" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'owner',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "super_admins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "super_admins_email_key" ON "super_admins"("email");

-- Seed default practice for existing Eastern Cape data
INSERT INTO "practices" ("id", "subdomain", "clinic_name", "subscription_status", "brand_color", "monthly_fee_cents", "setup_fee_paid", "created_at", "updated_at")
VALUES (
  'a0000000-0000-4000-8000-000000000001',
  'eastern-cape',
  'Eastern Cape Family Practice',
  'ACTIVE',
  '#1E40AF',
  80000,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- Add practice_id columns (nullable first)
ALTER TABLE "profiles" ADD COLUMN "practice_id" UUID;
ALTER TABLE "doctors" ADD COLUMN "practice_id" UUID;
ALTER TABLE "patients" ADD COLUMN "practice_id" UUID;
ALTER TABLE "appointments" ADD COLUMN "practice_id" UUID;
ALTER TABLE "medical_records" ADD COLUMN "practice_id" UUID;
ALTER TABLE "payments" ADD COLUMN "practice_id" UUID;
ALTER TABLE "messages" ADD COLUMN "practice_id" UUID;
ALTER TABLE "audit_logs" ADD COLUMN "practice_id" UUID;
ALTER TABLE "telemedicine_consent" ADD COLUMN "practice_id" UUID;

-- Backfill all existing rows to default practice
UPDATE "profiles" SET "practice_id" = 'a0000000-0000-4000-8000-000000000001' WHERE "practice_id" IS NULL;
UPDATE "doctors" SET "practice_id" = 'a0000000-0000-4000-8000-000000000001' WHERE "practice_id" IS NULL;
UPDATE "patients" SET "practice_id" = 'a0000000-0000-4000-8000-000000000001' WHERE "practice_id" IS NULL;
UPDATE "appointments" SET "practice_id" = 'a0000000-0000-4000-8000-000000000001' WHERE "practice_id" IS NULL;
UPDATE "medical_records" SET "practice_id" = 'a0000000-0000-4000-8000-000000000001' WHERE "practice_id" IS NULL;
UPDATE "payments" SET "practice_id" = 'a0000000-0000-4000-8000-000000000001' WHERE "practice_id" IS NULL;
UPDATE "messages" SET "practice_id" = 'a0000000-0000-4000-8000-000000000001' WHERE "practice_id" IS NULL;
UPDATE "audit_logs" SET "practice_id" = 'a0000000-0000-4000-8000-000000000001' WHERE "practice_id" IS NULL;
UPDATE "telemedicine_consent" SET "practice_id" = 'a0000000-0000-4000-8000-000000000001' WHERE "practice_id" IS NULL;

-- Enforce NOT NULL (audit_logs stays nullable for platform-level events)
ALTER TABLE "profiles" ALTER COLUMN "practice_id" SET NOT NULL;
ALTER TABLE "doctors" ALTER COLUMN "practice_id" SET NOT NULL;
ALTER TABLE "patients" ALTER COLUMN "practice_id" SET NOT NULL;
ALTER TABLE "appointments" ALTER COLUMN "practice_id" SET NOT NULL;
ALTER TABLE "medical_records" ALTER COLUMN "practice_id" SET NOT NULL;
ALTER TABLE "payments" ALTER COLUMN "practice_id" SET NOT NULL;
ALTER TABLE "messages" ALTER COLUMN "practice_id" SET NOT NULL;
ALTER TABLE "telemedicine_consent" ALTER COLUMN "practice_id" SET NOT NULL;

-- Replace email unique with (practice_id, email)
DROP INDEX IF EXISTS "profiles_email_key";
CREATE UNIQUE INDEX "profiles_practice_id_email_key" ON "profiles"("practice_id", "email");

-- Replace patient id_number unique with (practice_id, id_number)
DROP INDEX IF EXISTS "patients_id_number_key";
CREATE UNIQUE INDEX "patients_practice_id_id_number_key" ON "patients"("practice_id", "id_number");

-- Foreign keys
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "patients" ADD CONSTRAINT "patients_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "telemedicine_consent" ADD CONSTRAINT "telemedicine_consent_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "profiles_practice_id_idx" ON "profiles"("practice_id");
CREATE INDEX "doctors_practice_id_idx" ON "doctors"("practice_id");
CREATE INDEX "patients_practice_id_idx" ON "patients"("practice_id");
CREATE INDEX "appointments_practice_id_idx" ON "appointments"("practice_id");
CREATE INDEX "medical_records_practice_id_idx" ON "medical_records"("practice_id");
CREATE INDEX "payments_practice_id_idx" ON "payments"("practice_id");
CREATE INDEX "messages_practice_id_idx" ON "messages"("practice_id");
CREATE INDEX "audit_logs_practice_id_idx" ON "audit_logs"("practice_id");
CREATE INDEX "telemedicine_consent_practice_id_idx" ON "telemedicine_consent"("practice_id");
