/**
 * Super Admin-controlled 30-day pilot programme metadata.
 * Standard commercial trial remains 14 days for non-pilot Practices.
 *
 * PENDING_ACTIVATION does not extend operational or public booking access —
 * trialEndsAt remains authoritative until Owner activation starts the pilot clock.
 */

export const PILOT_PROGRAM_DURATION_DAYS = 30;
export const PILOT_PROGRAM_DURATION_MS = PILOT_PROGRAM_DURATION_DAYS * 24 * 60 * 60 * 1000;
export const STANDARD_TRIAL_DURATION_MS = 14 * 24 * 60 * 60 * 1000;

export type PilotProgramStatus =
  | 'NOT_GRANTED'
  | 'PENDING_ACTIVATION'
  | 'ACTIVE'
  | 'ENDED';

export type PilotProgramFields = {
  pilotProgramGrantedAt: Date | null;
  pilotProgramStartsAt: Date | null;
  pilotProgramEndsAt: Date | null;
};

export type SerializedPilotProgram = {
  status: PilotProgramStatus;
  granted_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  duration_days: typeof PILOT_PROGRAM_DURATION_DAYS;
};

export function pilotEndFromStart(start: Date): Date {
  return new Date(start.getTime() + PILOT_PROGRAM_DURATION_MS);
}

export function standardTrialEndsAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + STANDARD_TRIAL_DURATION_MS);
}

export function derivePilotProgramStatus(
  practice: PilotProgramFields,
  now: Date = new Date()
): PilotProgramStatus {
  if (!practice.pilotProgramGrantedAt) {
    return 'NOT_GRANTED';
  }
  if (!practice.pilotProgramStartsAt) {
    return 'PENDING_ACTIVATION';
  }
  if (!practice.pilotProgramEndsAt) {
    return 'PENDING_ACTIVATION';
  }
  if (now.getTime() <= practice.pilotProgramEndsAt.getTime()) {
    return 'ACTIVE';
  }
  return 'ENDED';
}

export function isPilotPendingActivation(practice: PilotProgramFields): boolean {
  return derivePilotProgramStatus(practice) === 'PENDING_ACTIVATION';
}

export function serializePilotProgram(
  practice: PilotProgramFields,
  now: Date = new Date()
): SerializedPilotProgram {
  const status = derivePilotProgramStatus(practice, now);
  return {
    status,
    granted_at: practice.pilotProgramGrantedAt?.toISOString() ?? null,
    starts_at: practice.pilotProgramStartsAt?.toISOString() ?? null,
    ends_at: practice.pilotProgramEndsAt?.toISOString() ?? null,
    duration_days: PILOT_PROGRAM_DURATION_DAYS,
  };
}

/** Compact list indicator — null when pilot was never granted. */
export function compactPilotProgramIndicator(
  practice: PilotProgramFields,
  now: Date = new Date()
): { status: Exclude<PilotProgramStatus, 'NOT_GRANTED'> } | null {
  const status = derivePilotProgramStatus(practice, now);
  if (status === 'NOT_GRANTED') return null;
  return { status };
}
