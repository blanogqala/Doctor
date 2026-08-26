-- Phase 6: telemedicine join lifecycle + room metadata

DO $$ BEGIN
  CREATE TYPE "telemedicine_patient_decision" AS ENUM ('PENDING', 'ACCEPTED_VIDEO', 'SWITCHED_IN_PERSON');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "doctor_joined_at" TIMESTAMP(3);
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "patient_joined_at" TIMESTAMP(3);
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "patient_telemedicine_decision" "telemedicine_patient_decision";
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "patient_telemedicine_decided_at" TIMESTAMP(3);
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "telemedicine_room_id" TEXT;
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "telemedicine_started_at" TIMESTAMP(3);
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "telemedicine_ended_at" TIMESTAMP(3);
