import { describe, expect, it } from 'vitest';
import type { Appointment } from '@/lib/types';
import {
  doctorDisplayFirstName,
  isRemainingToday,
  isStartable,
  isTerminal,
  isWaitingRoom,
  selectNextPatient,
  timeOfDayGreeting,
} from './status';

function appt(overrides: Partial<Appointment> & { id: string; status: Appointment['status'] }): Appointment {
  return {
    patient_id: 'p1',
    doctor_id: 'd1',
    created_by: null,
    scheduled_at: '2026-08-20T09:00:00.000Z',
    duration_minutes: 30,
    type: 'IN_PERSON',
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
    patient_telemedicine_decision: null,
    patient_telemedicine_decided_at: null,
    soft_deleted_at: null,
    created_at: '2026-08-20T08:00:00.000Z',
    updated_at: '2026-08-20T08:00:00.000Z',
    ...overrides,
  };
}

describe('appointment status helpers', () => {
  it('treats ARRIVED as waiting room and startable', () => {
    expect(isWaitingRoom('ARRIVED')).toBe(true);
    expect(isStartable('ARRIVED')).toBe(true);
    expect(isStartable('CONFIRMED_TELEMEDICINE')).toBe(true);
    expect(isStartable('COMPLETED')).toBe(false);
  });

  it('marks terminal and remaining correctly', () => {
    expect(isTerminal('COMPLETED')).toBe(true);
    expect(isTerminal('NO_SHOW')).toBe(true);
    expect(isRemainingToday('ARRIVED')).toBe(true);
    expect(isRemainingToday('IN_CONSULTATION')).toBe(true);
    expect(isRemainingToday('CANCELLED')).toBe(false);
  });

  it('selectNextPatient prefers active consult, then ARRIVED, then earliest startable', () => {
    const list = [
      appt({ id: '1', status: 'CONFIRMED', scheduled_at: '2026-08-20T08:00:00.000Z' }),
      appt({ id: '2', status: 'ARRIVED', scheduled_at: '2026-08-20T09:30:00.000Z' }),
      appt({
        id: '3',
        status: 'IN_CONSULTATION',
        scheduled_at: '2026-08-20T09:00:00.000Z',
        locked_by_doctor_id: 'd1',
      }),
    ];
    expect(selectNextPatient(list, 'd1')?.id).toBe('3');

    const withoutActive = list.filter((a) => a.id !== '3');
    expect(selectNextPatient(withoutActive, 'd1')?.id).toBe('2');

    const onlyConfirmed = [
      appt({ id: 'a', status: 'CONFIRMED', scheduled_at: '2026-08-20T11:00:00.000Z' }),
      appt({ id: 'b', status: 'PENDING', scheduled_at: '2026-08-20T10:00:00.000Z' }),
    ];
    expect(selectNextPatient(onlyConfirmed)?.id).toBe('b');
  });

  it('returns null when schedule is empty or only terminal', () => {
    expect(selectNextPatient([])).toBeNull();
    expect(
      selectNextPatient([appt({ id: 'x', status: 'COMPLETED', scheduled_at: '2026-08-20T08:00:00.000Z' })])
    ).toBeNull();
  });

  it('formats doctor greeting name and time of day', () => {
    expect(doctorDisplayFirstName('Dr. Thabo Ndlovu')).toBe('Thabo');
    expect(doctorDisplayFirstName(null)).toBe('Doctor');
    expect(timeOfDayGreeting(new Date('2026-08-20T08:00:00'))).toBe('Good morning');
    expect(timeOfDayGreeting(new Date('2026-08-20T14:00:00'))).toBe('Good afternoon');
    expect(timeOfDayGreeting(new Date('2026-08-20T19:00:00'))).toBe('Good evening');
  });
});
