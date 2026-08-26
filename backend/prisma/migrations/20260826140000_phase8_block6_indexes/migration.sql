-- Phase 8 Block 6: justified indexes for hot query patterns
CREATE INDEX IF NOT EXISTS "appointments_practice_id_scheduled_at_idx" ON "appointments"("practice_id", "scheduled_at");
CREATE INDEX IF NOT EXISTS "appointments_practice_id_status_idx" ON "appointments"("practice_id", "status");
CREATE INDEX IF NOT EXISTS "medical_records_appointment_id_idx" ON "medical_records"("appointment_id");
CREATE INDEX IF NOT EXISTS "medical_records_practice_id_patient_id_idx" ON "medical_records"("practice_id", "patient_id");
CREATE INDEX IF NOT EXISTS "medical_records_practice_id_is_draft_idx" ON "medical_records"("practice_id", "is_draft");
CREATE INDEX IF NOT EXISTS "medical_record_amendments_medical_record_id_idx" ON "medical_record_amendments"("medical_record_id");
CREATE INDEX IF NOT EXISTS "medical_record_amendments_doctor_id_idx" ON "medical_record_amendments"("doctor_id");
CREATE INDEX IF NOT EXISTS "prescriptions_medical_record_id_idx" ON "prescriptions"("medical_record_id");
CREATE INDEX IF NOT EXISTS "practice_sessions_expires_at_revoked_at_idx" ON "practice_sessions"("expires_at", "revoked_at");
CREATE INDEX IF NOT EXISTS "platform_sessions_expires_at_revoked_at_idx" ON "platform_sessions"("expires_at", "revoked_at");
