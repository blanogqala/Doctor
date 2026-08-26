import type { Appointment, AppointmentStatus } from '@/lib/types';

/** Statuses that mean the patient is still expected or present for care today. */
export const STARTABLE_STATUSES: readonly AppointmentStatus[] = [
  'PENDING',
  'PENDING_IN_PERSON',
  'CONFIRMED',
  'CONFIRMED_IN_PERSON',
  'CONFIRMED_TELEMEDICINE',
  'ARRIVED',
] as const;

/** Checked in / waiting room (reception mark arrived). */
export const WAITING_ROOM_STATUSES: readonly AppointmentStatus[] = ['ARRIVED'] as const;

export const TERMINAL_STATUSES: readonly AppointmentStatus[] = [
  'COMPLETED',
  'CANCELLED',
  'CANCELLED_NO_SHOW',
  'NO_SHOW',
] as const;

export const CANCELLED_LIKE_STATUSES: readonly AppointmentStatus[] = [
  'CANCELLED',
  'CANCELLED_NO_SHOW',
  'NO_SHOW',
] as const;

export function isStartable(status: AppointmentStatus): boolean {
  return (STARTABLE_STATUSES as readonly string[]).includes(status);
}

export function isWaitingRoom(status: AppointmentStatus): boolean {
  return (WAITING_ROOM_STATUSES as readonly string[]).includes(status);
}

export function isActiveConsult(status: AppointmentStatus): boolean {
  return status === 'IN_CONSULTATION';
}

export function isTerminal(status: AppointmentStatus): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

export function isCancelledLike(status: AppointmentStatus): boolean {
  return (CANCELLED_LIKE_STATUSES as readonly string[]).includes(status);
}

export function isCompleted(status: AppointmentStatus): boolean {
  return status === 'COMPLETED';
}

/** Patients still to be seen (startable or in consult). */
export function isRemainingToday(status: AppointmentStatus): boolean {
  return isStartable(status) || isActiveConsult(status);
}

export function sortByScheduledAt(a: Appointment, b: Appointment): number {
  return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
}

/**
 * Prefer an active consultation for this doctor; else earliest ARRIVED;
 * else earliest startable by schedule.
 */
export function selectNextPatient(
  appointments: Appointment[],
  doctorId?: string | null
): Appointment | null {
  const active = appointments.find(
    (a) =>
      isActiveConsult(a.status) &&
      (!doctorId || !a.locked_by_doctor_id || a.locked_by_doctor_id === doctorId)
  );
  if (active) return active;

  const waiting = appointments
    .filter((a) => isWaitingRoom(a.status))
    .sort(sortByScheduledAt);
  if (waiting[0]) return waiting[0];

  const startable = appointments.filter((a) => isStartable(a.status)).sort(sortByScheduledAt);
  return startable[0] ?? null;
}

export function countByStatus(
  appointments: Appointment[],
  predicate: (status: AppointmentStatus) => boolean
): number {
  return appointments.filter((a) => predicate(a.status)).length;
}

/** Time-of-day greeting for dashboard headers. */
export function timeOfDayGreeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Display name for doctor greetings (strip leading Dr./Dr ). */
export function doctorDisplayFirstName(fullName: string | null | undefined): string {
  if (!fullName?.trim()) return 'Doctor';
  const cleaned = fullName.replace(/^Dr\.?\s+/i, '').trim();
  return cleaned.split(/\s+/)[0] || 'Doctor';
}
