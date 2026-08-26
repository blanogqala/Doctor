-- AlterTable
ALTER TABLE "medical_records" ADD COLUMN IF NOT EXISTS "scribe_audio_path" TEXT;
ALTER TABLE "medical_records" ADD COLUMN IF NOT EXISTS "scribe_audio_mime_type" TEXT;
ALTER TABLE "medical_records" ADD COLUMN IF NOT EXISTS "scribe_transcript" TEXT;
ALTER TABLE "medical_records" ADD COLUMN IF NOT EXISTS "scribe_detected_language" TEXT;
ALTER TABLE "medical_records" ADD COLUMN IF NOT EXISTS "scribe_warnings" JSONB;
ALTER TABLE "medical_records" ADD COLUMN IF NOT EXISTS "scribe_confidence" JSONB;
ALTER TABLE "medical_records" ADD COLUMN IF NOT EXISTS "scribe_recorded_at" TIMESTAMP(3);
