-- Phase 5: AI Clinical Copilot — provenance, transcript status, recording consent
CREATE TYPE "scribe_transcript_status" AS ENUM ('PROCESSING', 'READY', 'FAILED');
CREATE TYPE "recording_consent_mode" AS ENUM ('CONSULTATION', 'DICTATION');

ALTER TABLE "medical_records"
  ADD COLUMN IF NOT EXISTS "scribe_status" "scribe_transcript_status",
  ADD COLUMN IF NOT EXISTS "ai_field_provenance" JSONB;

CREATE TABLE IF NOT EXISTS "consultation_recording_consents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "practice_id" UUID NOT NULL,
  "patient_id" UUID NOT NULL,
  "doctor_id" UUID NOT NULL,
  "medical_record_id" UUID,
  "appointment_id" UUID,
  "consent_mode" "recording_consent_mode" NOT NULL,
  "consent_text_hash" TEXT,
  "consented_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMP(3),
  "ip_address" TEXT,
  "user_agent" TEXT,
  CONSTRAINT "consultation_recording_consents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "consultation_recording_consents_practice_id_idx" ON "consultation_recording_consents"("practice_id");
CREATE INDEX IF NOT EXISTS "consultation_recording_consents_patient_id_idx" ON "consultation_recording_consents"("patient_id");
CREATE INDEX IF NOT EXISTS "consultation_recording_consents_doctor_id_idx" ON "consultation_recording_consents"("doctor_id");
CREATE INDEX IF NOT EXISTS "consultation_recording_consents_medical_record_id_idx" ON "consultation_recording_consents"("medical_record_id");

ALTER TABLE "consultation_recording_consents"
  ADD CONSTRAINT "consultation_recording_consents_practice_id_fkey"
  FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "consultation_recording_consents"
  ADD CONSTRAINT "consultation_recording_consents_patient_id_fkey"
  FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "consultation_recording_consents"
  ADD CONSTRAINT "consultation_recording_consents_medical_record_id_fkey"
  FOREIGN KEY ("medical_record_id") REFERENCES "medical_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
