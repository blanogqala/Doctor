import { describe, expect, it } from 'vitest';
import {
  ageFromDob,
  buildClinicalTimeline,
  buildConsultationTree,
  buildPatientFolderOverview,
  doctorDisplayName,
  flattenPrescriptions,
  parseFolderSection,
  recordStatusLabel,
} from '@/lib/clinical/patient-folder';
import type { Appointment, MedicalRecord, Prescription } from '@/lib/types';

function baseRecord(overrides: Partial<MedicalRecord> = {}): MedicalRecord {
  return {
    id: 'r1',
    patient_id: 'p1',
    doctor_id: 'd1',
    appointment_id: null,
    parent_record_id: null,
    record_date: '2026-08-20T10:00:00.000Z',
    subjective: null,
    objective: null,
    assessment: null,
    plan: null,
    diagnosis_codes: [],
    is_erroneous: false,
    soft_deleted_at: null,
    created_at: '2026-08-20T10:00:00.000Z',
    updated_at: '2026-08-20T10:00:00.000Z',
    chief_complaint: 'Headache',
    history_present_illness: null,
    review_of_systems: null,
    physical_examination: null,
    vital_signs: null,
    general_appearance: null,
    primary_diagnosis: 'Tension headache',
    differential_diagnoses: [],
    severity: null,
    lifestyle_advice: null,
    follow_up_date: null,
    is_draft: false,
    doctor_notes_private: null,
    prescriptions: [],
    referrals: [],
    amendments: [],
    doctor: {
      id: 'd1',
      profile_id: 'pf1',
      hpcsa_registration_number: null,
      practice_name: 'Clinic',
      specialization: 'GP',
      is_verified: true,
      consultation_fee_cents: 0,
      bio: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      profile: {
        id: 'pf1',
        full_name: 'Dr Ndlovu',
        email: 'd@x.com',
        role: 'DOCTOR',
        phone: null,
        is_active: true,
        last_login_at: null,
        soft_deleted_at: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    },
    ...overrides,
  };
}

describe('patient-folder helpers', () => {
  it('computes age from DOB', () => {
    expect(ageFromDob('1992-01-01', new Date('2026-08-20'))).toBe(34);
    expect(ageFromDob(null)).toBeNull();
  });

  it('labels draft vs finalized', () => {
    expect(recordStatusLabel(baseRecord({ is_draft: true }))).toBe('Draft');
    expect(recordStatusLabel(baseRecord({ is_draft: false }))).toBe('Finalized');
    expect(recordStatusLabel(baseRecord({ is_erroneous: true }))).toBe('Erroneous');
  });

  it('builds parent/follow-up tree and newest-first timeline', () => {
    const parent = baseRecord({ id: 'parent', record_date: '2026-08-01T10:00:00.000Z' });
    const child = baseRecord({
      id: 'child',
      parent_record_id: 'parent',
      record_date: '2026-08-15T10:00:00.000Z',
      chief_complaint: 'Follow-up visit',
    });
    const tree = buildConsultationTree([child, parent]);
    expect(tree).toHaveLength(1);
    expect(tree[0].followUps[0].id).toBe('child');

    const timeline = buildClinicalTimeline([child, parent], [], {
      patientId: 'p1',
      basePath: 'doctor',
    });
    expect(timeline[0].recordId).toBe('child');
    expect(timeline.some((e) => e.kind === 'follow_up')).toBe(true);
    expect(timeline.find((e) => e.recordId === 'child')?.href).toContain('/view/child');
  });

  it('orders timeline with prescriptions and amendments newest-first', () => {
    const rx: Prescription = {
      id: 'rx1',
      medical_record_id: 'r1',
      patient_id: 'p1',
      doctor_id: 'pf1',
      drug_name: 'Amlodipine',
      dosage: '5mg',
      frequency: 'daily',
      duration: '30 days',
      instructions: null,
      generic_name: null,
      brand_name: null,
      strength: '5mg',
      dosage_form: null,
      route: 'oral',
      quantity: null,
      is_prn: false,
      status: 'active',
      created_at: '2026-08-21T10:00:00.000Z',
    };
    const record = baseRecord({
      prescriptions: [rx],
      amendments: [
        {
          id: 'a1',
          medical_record_id: 'r1',
          doctor_id: 'pf1',
          correction_note: 'Corrected dosage',
          created_at: '2026-08-22T10:00:00.000Z',
        },
      ],
    });
    const timeline = buildClinicalTimeline([record]);
    expect(timeline[0].kind).toBe('amendment');
    expect(timeline.some((e) => e.kind === 'prescription' && e.subtitle?.includes('Amlodipine'))).toBe(
      true
    );
    expect(flattenPrescriptions([record])[0].drug_name).toBe('Amlodipine');
  });

  it('builds overview from existing data only', () => {
    const draft = baseRecord({
      id: 'draft',
      is_draft: true,
      record_date: '2026-08-25T10:00:00.000Z',
      primary_diagnosis: null,
    });
    const final = baseRecord({
      id: 'final',
      is_draft: false,
      follow_up_date: '2026-09-01',
      record_date: '2026-08-10T10:00:00.000Z',
    });
    const appt: Appointment = {
      id: 'ap1',
      patient_id: 'p1',
      doctor_id: 'd1',
      created_by: null,
      scheduled_at: '2026-09-10T09:00:00.000Z',
      duration_minutes: 30,
      type: 'IN_PERSON',
      status: 'CONFIRMED',
      reason: 'Review',
      notes: null,
      cancellation_reason: null,
      locked_by_doctor_id: null,
      delay_minutes: 0,
      reminder_sent_at: null,
      consultation_started_at: null,
      doctor_joined_at: null,
      patient_joined_at: null,
      parent_record_id: null,
      patient_telemedicine_decision: null,
      patient_telemedicine_decided_at: null,
      soft_deleted_at: null,
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z',
    };
    const overview = buildPatientFolderOverview([draft, final], [appt], new Date('2026-08-20'));
    expect(overview.recordCount).toBe(2);
    expect(overview.draftCount).toBe(1);
    expect(overview.finalizedCount).toBe(1);
    expect(overview.latestConsultation?.id).toBe('draft');
    expect(overview.recentDiagnoses).toEqual(['Tension headache']);
    expect(overview.nextAppointment?.id).toBe('ap1');
    expect(overview.outstandingFollowUp?.id).toBe('final');
  });

  it('formats doctor display and folder section', () => {
    expect(doctorDisplayName('Dr. Ndlovu')).toBe('Dr Ndlovu');
    expect(parseFolderSection('timeline')).toBe('overview');
    expect(parseFolderSection('prescriptions')).toBe('overview');
    expect(parseFolderSection('referrals')).toBe('overview');
    expect(parseFolderSection('consultations')).toBe('consultations');
    expect(parseFolderSection('nope')).toBe('overview');
  });
});
