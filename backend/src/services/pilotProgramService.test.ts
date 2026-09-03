import { describe, expect, it } from 'vitest';
import {
  PILOT_PROGRAM_DURATION_MS,
  STANDARD_TRIAL_DURATION_MS,
  compactPilotProgramIndicator,
  derivePilotProgramStatus,
  isPilotPendingActivation,
  pilotEndFromStart,
  serializePilotProgram,
  standardTrialEndsAt,
} from './pilotProgramService';

describe('pilotProgramService', () => {
  const now = new Date('2026-09-03T12:00:00.000Z');

  it('computes standard 14-day and 30-day durations', () => {
    const start = new Date('2026-09-01T00:00:00.000Z');
    expect(standardTrialEndsAt(start).getTime() - start.getTime()).toBe(STANDARD_TRIAL_DURATION_MS);
    expect(pilotEndFromStart(start).getTime() - start.getTime()).toBe(PILOT_PROGRAM_DURATION_MS);
  });

  it('derives NOT_GRANTED when no grant timestamp', () => {
    expect(
      derivePilotProgramStatus(
        {
          pilotProgramGrantedAt: null,
          pilotProgramStartsAt: null,
          pilotProgramEndsAt: null,
        },
        now
      )
    ).toBe('NOT_GRANTED');
  });

  it('derives PENDING_ACTIVATION when granted but not started', () => {
    expect(
      derivePilotProgramStatus(
        {
          pilotProgramGrantedAt: new Date('2026-09-01T00:00:00.000Z'),
          pilotProgramStartsAt: null,
          pilotProgramEndsAt: null,
        },
        now
      )
    ).toBe('PENDING_ACTIVATION');
    expect(
      isPilotPendingActivation({
        pilotProgramGrantedAt: new Date('2026-09-01T00:00:00.000Z'),
        pilotProgramStartsAt: null,
        pilotProgramEndsAt: null,
      })
    ).toBe(true);
  });

  it('derives ACTIVE while within pilot window', () => {
    const startsAt = new Date('2026-09-01T00:00:00.000Z');
    const endsAt = pilotEndFromStart(startsAt);
    expect(
      derivePilotProgramStatus(
        {
          pilotProgramGrantedAt: startsAt,
          pilotProgramStartsAt: startsAt,
          pilotProgramEndsAt: endsAt,
        },
        now
      )
    ).toBe('ACTIVE');
  });

  it('derives ENDED after pilot ends', () => {
    const startsAt = new Date('2026-08-01T00:00:00.000Z');
    const endsAt = pilotEndFromStart(startsAt);
    expect(
      derivePilotProgramStatus(
        {
          pilotProgramGrantedAt: startsAt,
          pilotProgramStartsAt: startsAt,
          pilotProgramEndsAt: endsAt,
        },
        now
      )
    ).toBe('ENDED');
  });

  it('serializes pilot metadata with duration_days 30', () => {
    const grantedAt = new Date('2026-09-01T00:00:00.000Z');
    expect(
      serializePilotProgram(
        {
          pilotProgramGrantedAt: grantedAt,
          pilotProgramStartsAt: null,
          pilotProgramEndsAt: null,
        },
        now
      )
    ).toEqual({
      status: 'PENDING_ACTIVATION',
      granted_at: grantedAt.toISOString(),
      starts_at: null,
      ends_at: null,
      duration_days: 30,
    });
  });

  it('returns null compact indicator when not granted', () => {
    expect(
      compactPilotProgramIndicator({
        pilotProgramGrantedAt: null,
        pilotProgramStartsAt: null,
        pilotProgramEndsAt: null,
      })
    ).toBeNull();
  });

  it('returns compact status when granted', () => {
    expect(
      compactPilotProgramIndicator({
        pilotProgramGrantedAt: now,
        pilotProgramStartsAt: null,
        pilotProgramEndsAt: null,
      })
    ).toEqual({ status: 'PENDING_ACTIVATION' });
  });
});
