import { describe, expect, it } from 'vitest';
import type { Appointment } from '@/lib/types';

const CLOSED = new Set(['CANCELLED', 'CANCELLED_NO_SHOW', 'NO_SHOW', 'COMPLETED']);

function canJoinTelemedicine(appt: Appointment) {
  return appt.type === 'TELEMEDICINE' && !CLOSED.has(appt.status);
}

describe('telemedicine join eligibility', () => {
  const base: Appointment = {
    id: '1',
    patient_id: 'p1',
    doctor_id: 'd1',
    created_by: null,
    scheduled_at: new Date().toISOString(),
    duration_minutes: 30,
    type: 'TELEMEDICINE',
    status: 'CONFIRMED_TELEMEDICINE',
    reason: null,
    cancellation_reason: null,
    notes: null,
    locked_by_doctor_id: null,
    consultation_started_at: null,
    doctor_joined_at: null,
    patient_joined_at: null,
    delay_minutes: 0,
    reminder_sent_at: null,
    parent_record_id: null,
    patient_telemedicine_decision: 'ACCEPTED_VIDEO',
    patient_telemedicine_decided_at: null,
    telemedicine_room_id: null,
    telemedicine_started_at: null,
    telemedicine_ended_at: null,
    soft_deleted_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it('allows join for active telemedicine before doctor joins', () => {
    expect(canJoinTelemedicine(base)).toBe(true);
  });

  it('blocks completed appointments', () => {
    expect(canJoinTelemedicine({ ...base, status: 'COMPLETED' })).toBe(false);
  });
});
