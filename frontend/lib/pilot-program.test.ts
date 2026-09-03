import { describe, expect, it } from 'vitest';
import {
  daysRemaining,
  onboardReviewTrialLabel,
  pilotProgramBadgeLabel,
} from './pilot-program';

describe('pilot-program helpers', () => {
  it('defaults onboard review copy to standard 14-day trial', () => {
    expect(onboardReviewTrialLabel(false)).toBe('Trial access: Standard 14-day trial');
  });

  it('shows pilot copy when grant toggle is on', () => {
    expect(onboardReviewTrialLabel(true)).toBe(
      'Pilot Programme: 30 days from Owner activation'
    );
  });

  it('maps pilot statuses to list badge labels', () => {
    expect(pilotProgramBadgeLabel('PENDING_ACTIVATION')).toBe('Pilot pending');
    expect(pilotProgramBadgeLabel('ACTIVE')).toBe('Pilot active');
    expect(pilotProgramBadgeLabel('ENDED')).toBe('Pilot ended');
    expect(pilotProgramBadgeLabel('NOT_GRANTED')).toBe('');
  });

  it('computes days remaining until pilot end', () => {
    const now = new Date('2026-09-01T00:00:00.000Z');
    expect(daysRemaining('2026-09-11T00:00:00.000Z', now)).toBe(10);
    expect(daysRemaining('2026-08-31T00:00:00.000Z', now)).toBe(0);
    expect(daysRemaining(null, now)).toBeNull();
  });
});
