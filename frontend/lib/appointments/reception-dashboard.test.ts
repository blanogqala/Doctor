import { describe, expect, it } from 'vitest';
import { receptionAppointmentLabel } from './reception-labels';
import type { Appointment } from '@/lib/types';

function sampleAppt(): Appointment {
  return {
    id: 'a1',
    patient_id: 'p1',
    doctor_id: 'd1',
    created_by: null,
    scheduled_at: '2026-08-20T09:00:00.000Z',
    duration_minutes: 30,
    type: 'IN_PERSON',
    status: 'ARRIVED',
    reason: 'Follow-up',
    cancellation_reason: null,
    notes: 'PRIVATE CLINICAL NOTE SHOULD NOT BE USED',
    locked_by_doctor_id: null,
    consultation_started_at: null,
    doctor_joined_at: null,
    patient_joined_at: null,
    delay_minutes: 0,
    reminder_sent_at: null,
    parent_record_id: null,
    patient_telemedicine_decision: null,
    patient_telemedicine_decided_at: null,
    soft_deleted_at: null,
    created_at: '2026-08-20T08:00:00.000Z',
    updated_at: '2026-08-20T08:00:00.000Z',
    patient: {
      id: 'p1',
      profile_id: 'u1',
      id_number: null,
      id_number_last4: null,
      date_of_birth: null,
      gender: 'UNKNOWN',
      address: null,
      city: null,
      province: null,
      medical_aid_provider: null,
      medical_aid_number: null,
      emergency_contact_name: null,
      emergency_contact_phone: null,
      assigned_doctor_id: null,
      consent_telemedicine: false,
      medical_history: null,
      allergies: null,
      current_medications: null,
      soft_deleted_at: null,
      created_at: '',
      updated_at: '',
      profile: {
        id: 'u1',
        full_name: 'Thando Molefe',
        email: 't@example.com',
        role: 'PATIENT',
        phone: null,
        is_active: true,
        last_login_at: null,
        soft_deleted_at: null,
        created_at: '',
        updated_at: '',
      },
    },
    doctor: {
      id: 'd1',
      profile_id: 'u2',
      hpcsa_registration_number: null,
      practice_name: 'Clinic',
      specialization: 'GP',
      is_verified: true,
      consultation_fee_cents: 60000,
      bio: null,
      created_at: '',
      updated_at: '',
      profile: {
        id: 'u2',
        full_name: 'Dr Ndlovu',
        email: 'd@example.com',
        role: 'DOCTOR',
        phone: null,
        is_active: true,
        last_login_at: null,
        soft_deleted_at: null,
        created_at: '',
        updated_at: '',
      },
    },
  };
}

describe('reception dashboard privacy helpers', () => {
  it('exposes only operational labels (patient, doctor, reason) — not notes', () => {
    const label = receptionAppointmentLabel(sampleAppt());
    expect(label.patient).toBe('Thando Molefe');
    expect(label.doctor).toBe('Dr Ndlovu');
    expect(label.reason).toBe('Follow-up');
    expect(JSON.stringify(label)).not.toMatch(/PRIVATE CLINICAL|assessment|diagnosis|prescription/i);
  });
});
