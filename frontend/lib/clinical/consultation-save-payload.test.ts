import { describe, expect, it } from 'vitest';
import { emptyClinicalForm } from '@/lib/clinical-form';
import { buildConsultationSavePayload } from '@/lib/clinical/consultation-save-payload';

const PATIENT_ID = '005c6885-d07a-4e0f-8fbc-60f10f41e974';
const DOCTOR_ID = '11111111-1111-4111-8111-111111111111';

const referral = {
  referred_to: '',
  specialty: '',
  institution: '',
  contact: '',
  reason: '',
  urgency: 'ROUTINE' as const,
  clinical_summary: '',
  specific_questions: '',
};

describe('buildConsultationSavePayload provenance', () => {
  it('omits ai_field_provenance when empty so PATCH is not rejected as null', () => {
    const payload = buildConsultationSavePayload({
      patientId: PATIENT_ID,
      clinical: emptyClinicalForm(),
      privateNotes: [],
      medications: [],
      referral,
      aiProvenance: {},
      isDraft: false,
    });
    expect(payload).not.toHaveProperty('ai_field_provenance');
  });

  it('includes sanitized provenance and drops invalid acceptedByDoctorId', () => {
    const payload = buildConsultationSavePayload({
      patientId: PATIENT_ID,
      clinical: emptyClinicalForm(),
      privateNotes: [],
      medications: [],
      referral,
      aiProvenance: {
        assessment: {
          source: 'AI_ACCEPTED',
          acceptedByDoctorId: '',
        },
        plan: {
          source: 'AI_ACCEPTED',
          acceptedByDoctorId: DOCTOR_ID,
        },
      },
      isDraft: false,
    });
    expect(payload.ai_field_provenance).toEqual({
      assessment: { source: 'AI_ACCEPTED' },
      plan: { source: 'AI_ACCEPTED', acceptedByDoctorId: DOCTOR_ID },
    });
  });

  it('lettersOnly payload includes referrals and omits clinical fields', () => {
    const payload = buildConsultationSavePayload({
      patientId: PATIENT_ID,
      clinical: { ...emptyClinicalForm(), chief_complaint: 'locked complaint' },
      privateNotes: [],
      medications: [],
      referral: {
        ...referral,
        referred_to: 'Dr P Mene',
        specialty: 'Endocrinology',
        clinical_summary: 'Please review.',
      },
      aiProvenance: {
        assessment: { source: 'AI_ACCEPTED', acceptedByDoctorId: DOCTOR_ID },
      },
      isDraft: false,
      lettersOnly: true,
    });
    expect(payload).toEqual({
      referrals: [
        {
          referred_to: 'Dr P Mene',
          specialty: 'Endocrinology',
          referred_to_institution: null,
          referred_to_contact: null,
          reason: 'Referral',
          urgency: 'ROUTINE',
          clinical_summary: 'Please review.',
          specific_questions: null,
          status: 'sent',
        },
      ],
      clinical_letters: [],
    });
    expect(payload).not.toHaveProperty('chief_complaint');
    expect(payload).not.toHaveProperty('is_draft');
    expect(payload).not.toHaveProperty('prescriptions');
  });

  it('saves a referral letter even when referred_to is blank', () => {
    const payload = buildConsultationSavePayload({
      patientId: PATIENT_ID,
      clinical: emptyClinicalForm(),
      privateNotes: [],
      medications: [],
      referral: {
        ...referral,
        clinical_summary: 'Dear colleague,\nPlease review.',
      },
      clinicalLetter: {
        document_type: 'WORK_ATTENDANCE',
        absence_start: '',
        absence_end: '',
        restrictions: '',
        include_diagnosis: false,
        doctor_notes: '',
        letter: 'This confirms attendance.',
        approved: true,
      },
      aiProvenance: {},
      lettersOnly: true,
    });
    expect(payload.referrals).toEqual([
      expect.objectContaining({
        referred_to: 'To whom it may concern',
        clinical_summary: 'Dear colleague,\nPlease review.',
      }),
    ]);
    expect(payload.clinical_letters).toEqual([
      expect.objectContaining({
        document_type: 'WORK_ATTENDANCE',
        letter: 'This confirms attendance.',
        approved: true,
      }),
    ]);
  });
});
