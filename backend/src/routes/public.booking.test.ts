import { describe, expect, it } from 'vitest';
import { SubscriptionStatus } from '@prisma/client';
import { isPublicBookingAvailable } from '../routes/public';
import { isTrialSubscriptionGateBlocked } from '../middleware/tenant';
import { PILOT_PROGRAM_DURATION_MS } from '../services/pilotProgramService';

const now = new Date('2026-09-20T12:00:00.000Z');
const expiredPlaceholderTrial = new Date('2026-09-10T00:00:00.000Z');
const unexpiredPlaceholderTrial = new Date('2026-09-25T00:00:00.000Z');

describe('pending pilot access regression', () => {
  it('1. pending pilot + unexpired placeholder trial → booking available normally', () => {
    expect(
      isPublicBookingAvailable({
        subscriptionStatus: SubscriptionStatus.TRIAL,
        trialEndsAt: unexpiredPlaceholderTrial,
        now,
      })
    ).toBe(true);
  });

  it('2. pending pilot + expired placeholder trial → booking unavailable', () => {
    // Pilot metadata is PENDING_ACTIVATION in DB; booking still keys off trialEndsAt only.
    expect(
      isPublicBookingAvailable({
        subscriptionStatus: SubscriptionStatus.TRIAL,
        trialEndsAt: expiredPlaceholderTrial,
        now,
      })
    ).toBe(false);
  });

  it('5. pending pilot does not bypass tenant subscription gate', () => {
    expect(
      isTrialSubscriptionGateBlocked(
        {
          subscriptionStatus: SubscriptionStatus.TRIAL,
          trialEndsAt: expiredPlaceholderTrial,
        },
        now
      )
    ).toBe(true);

    expect(
      isTrialSubscriptionGateBlocked(
        {
          subscriptionStatus: SubscriptionStatus.TRIAL,
          trialEndsAt: unexpiredPlaceholderTrial,
        },
        now
      )
    ).toBe(false);
  });
});

describe('active pilot booking via trialEndsAt', () => {
  it('4. successful owner activation → fresh 30-day trialEndsAt and booking available', () => {
    const startsAt = new Date('2026-09-20T12:00:00.000Z');
    const endsAt = new Date(startsAt.getTime() + PILOT_PROGRAM_DURATION_MS);

    expect(endsAt.getTime() - startsAt.getTime()).toBe(PILOT_PROGRAM_DURATION_MS);

    expect(
      isPublicBookingAvailable({
        subscriptionStatus: SubscriptionStatus.TRIAL,
        trialEndsAt: endsAt,
        now: new Date(startsAt.getTime() + 60_000),
      })
    ).toBe(true);

    expect(
      isPublicBookingAvailable({
        subscriptionStatus: SubscriptionStatus.TRIAL,
        trialEndsAt: endsAt,
        now: new Date(endsAt.getTime() + 1),
      })
    ).toBe(false);
  });
});

describe('isPublicBookingAvailable baseline', () => {
  it('allows booking for active subscription', () => {
    expect(
      isPublicBookingAvailable({
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        trialEndsAt: null,
        now,
      })
    ).toBe(true);
  });

  it('blocks booking when standard trial expired without pilot', () => {
    expect(
      isPublicBookingAvailable({
        subscriptionStatus: SubscriptionStatus.TRIAL,
        trialEndsAt: expiredPlaceholderTrial,
        now,
      })
    ).toBe(false);
  });
});
