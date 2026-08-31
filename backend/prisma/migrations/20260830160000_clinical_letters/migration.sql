ALTER TABLE "medical_records"
  ADD COLUMN IF NOT EXISTS "clinical_letters" JSONB;
