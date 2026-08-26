import { z } from 'zod';

export const appointmentCreateSchema = z.object({
  doctor_id: z.string().uuid().optional(),
  patient_id: z.string().uuid().optional(),
  scheduled_at: z.string().min(1),
  duration_minutes: z.coerce.number().int().min(5).max(480).optional(),
  type: z.enum(['IN_PERSON', 'TELEMEDICINE']).optional(),
  status: z.string().optional(),
  reason: z.string().max(2000).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export const appointmentUpdateSchema = z
  .object({
    doctor_id: z.string().uuid().optional(),
    patient_id: z.string().uuid().optional(),
    scheduled_at: z.string().optional(),
    duration_minutes: z.coerce.number().int().min(5).max(480).optional(),
    type: z.enum(['IN_PERSON', 'TELEMEDICINE']).optional(),
    status: z.string().optional(),
    reason: z.string().max(2000).nullable().optional(),
    cancellation_reason: z.string().max(2000).nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
    locked_by_doctor_id: z.string().uuid().nullable().optional(),
    doctor_joined_at: z.string().nullable().optional(),
    patient_joined_at: z.string().nullable().optional(),
    soft_deleted_at: z.string().nullable().optional(),
  })
  .passthrough();

export const vitalSignsSchema = z
  .object({
    bp_systolic: z.number().nullable().optional(),
    bp_diastolic: z.number().nullable().optional(),
    hr: z.number().nullable().optional(),
    temp: z.number().nullable().optional(),
    rr: z.number().nullable().optional(),
    spo2: z.number().nullable().optional(),
    weight: z.number().nullable().optional(),
    height: z.number().nullable().optional(),
    bmi: z.number().nullable().optional(),
  })
  .passthrough();

export const referralUrgencySchema = z.enum(['ROUTINE', 'URGENT']);

export const REFERRAL_URGENCY_VALUES = ['ROUTINE', 'URGENT'] as const;

export const referralNestedSchema = z
  .object({
    referred_to: z.string().min(1).max(500),
    specialty: z.string().max(500).nullable().optional(),
    reason: z.string().min(1).max(10000),
    urgency: referralUrgencySchema.optional().default('ROUTINE'),
    referred_to_institution: z.string().max(500).nullable().optional(),
    referred_to_contact: z.string().max(500).nullable().optional(),
    clinical_summary: z.string().max(20000).nullable().optional(),
    specific_questions: z.string().max(10000).nullable().optional(),
    status: z.string().max(50).optional(),
  })
  .passthrough();

export const aiFieldProvenanceEntrySchema = z.object({
  source: z.enum(['AI', 'DOCTOR', 'AI_ACCEPTED', 'AI_ACCEPTED_AND_EDITED']),
  model: z.string().max(200).optional(),
  generatedAt: z.string().optional(),
  acceptedAt: z.string().optional(),
  acceptedByDoctorId: z.string().uuid().optional(),
  modifiedAfterAcceptance: z.boolean().optional(),
});

export const aiFieldProvenanceMapSchema = z.record(aiFieldProvenanceEntrySchema);

export const medicalRecordCreateSchema = z.object({
  patient_id: z.string().uuid(),
  appointment_id: z.string().uuid().nullable().optional(),
  record_date: z.string().optional(),
  subjective: z.string().max(20000).nullable().optional(),
  objective: z.string().max(20000).nullable().optional(),
  assessment: z.string().max(20000).nullable().optional(),
  plan: z.string().max(20000).nullable().optional(),
  diagnosis_codes: z.array(z.string()).optional(),
  chief_complaint: z.string().max(5000).nullable().optional(),
  history_present_illness: z.string().max(20000).nullable().optional(),
  review_of_systems: z.record(z.boolean()).optional(),
  physical_examination: z.record(z.unknown()).optional(),
  vital_signs: vitalSignsSchema.optional(),
  general_appearance: z.string().max(2000).nullable().optional(),
  primary_diagnosis: z.string().max(2000).nullable().optional(),
  differential_diagnoses: z.array(z.string()).optional(),
  severity: z.string().nullable().optional(),
  lifestyle_advice: z.string().max(10000).nullable().optional(),
  follow_up_date: z.string().nullable().optional(),
  is_draft: z.boolean().optional(),
  doctor_notes_private: z.unknown().optional(),
  prescriptions: z.array(z.record(z.unknown())).optional(),
  referrals: z.array(referralNestedSchema).optional(),
  ai_field_provenance: aiFieldProvenanceMapSchema.optional(),
});

export const medicalRecordUpdateSchema = medicalRecordCreateSchema
  .omit({ patient_id: true })
  .extend({
    is_erroneous: z.boolean().optional(),
    autosave: z.boolean().optional(),
    expected_updated_at: z.string().datetime().optional(),
  })
  .partial();

export const recordingConsentCreateSchema = z.object({
  patient_id: z.string().uuid(),
  medical_record_id: z.string().uuid().nullable().optional(),
  appointment_id: z.string().uuid().nullable().optional(),
  consent_mode: z.enum(['CONSULTATION', 'DICTATION']),
  consent_text_hash: z.string().max(128).nullable().optional(),
});

export const clinicalLetterDraftSchema = z.object({
  patient_id: z.string().uuid(),
  document_type: z.enum([
    'MEDICAL_CERTIFICATE',
    'WORK_ATTENDANCE',
    'SCHOOL_ATTENDANCE',
  ]),
  letter_date: z.string().max(40).nullable().optional(),
  absence_start: z.string().max(40).nullable().optional(),
  absence_end: z.string().max(40).nullable().optional(),
  restrictions: z.string().max(5000).nullable().optional(),
  include_diagnosis: z.boolean().optional(),
  diagnosis_text: z.string().max(2000).nullable().optional(),
  doctor_notes: z.string().max(5000).nullable().optional(),
  patient_display_name: z.string().min(1).max(500),
  doctor_display_name: z.string().max(500).nullable().optional(),
  practice_name: z.string().max(500).nullable().optional(),
});

export const telemedicineConsentSchema = z.object({
  patient_id: z.string().uuid(),
  consent_given: z.boolean(),
  consent_text_hash: z.string().max(256).nullable().optional(),
});

export const amendmentSchema = z.object({
  correction_note: z.string().min(1).max(10000),
});
