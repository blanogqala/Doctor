import { describe, expect, it } from 'vitest';
import { selectNextPatient } from './status';
import type { Appointment } from '@/lib/types';

function appt(partial: Partial<Appointment> & Pick<Appointment, 'id' | 'status' | 'scheduled_at'>): Appointment {
  return {
    patient_id: 'p1',
    doctor_id: 'd1',
    created_by: null,
    duration_minutes: 30,
    type: 'IN_PERSON',
    reason: 'Check-up',
    cancellation_reason: null,
    notes: null,
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
    ...partial,
  };
}

describe('doctor next patient selection', () => {
  it('returns null for empty schedule (empty state)', () => {
    expect(selectNextPatient([])).toBeNull();
  });

  it('surfaces ARRIVED patient ahead of later confirmed slots', () => {
    const next = selectNextPatient([
      appt({ id: 'later', status: 'CONFIRMED', scheduled_at: '2026-08-20T11:00:00.000Z' }),
      appt({ id: 'wait', status: 'ARRIVED', scheduled_at: '2026-08-20T10:30:00.000Z' }),
    ]);
    expect(next?.id).toBe('wait');
  });
});
