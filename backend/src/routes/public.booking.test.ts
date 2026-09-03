import { describe, expect, it } from 'vitest';
import { SubscriptionStatus, SubscriptionSuspensionReason } from '@prisma/client';
import { isPublicBookingAvailable } from '../routes/public';
import { derivePracticeAccess } from '../services/practiceAccessPolicy';
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
        ownerProfileId: null,
        now,
      })
    ).toBe(true);
  });

  it('2. pending pilot + expired placeholder trial → booking unavailable', () => {
    expect(
      isPublicBookingAvailable({
        subscriptionStatus: SubscriptionStatus.TRIAL,
        trialEndsAt: expiredPlaceholderTrial,
        ownerProfileId: null,
        now,
      })
    ).toBe(false);
  });

  it('5. pending pilot does not bypass access policy after placeholder expiry', () => {
    expect(
      derivePracticeAccess(
        {
          subscriptionStatus: SubscriptionStatus.TRIAL,
          trialEndsAt: expiredPlaceholderTrial,
          ownerProfileId: null,
        },
        now
      )
    ).toMatchObject({ mode: 'BLOCKED', reason: 'ONBOARDING_TRIAL_EXPIRED' });

    expect(
      derivePracticeAccess(
        {
          subscriptionStatus: SubscriptionStatus.TRIAL,
          trialEndsAt: unexpiredPlaceholderTrial,
          ownerProfileId: null,
        },
        now
      )
    ).toMatchObject({ mode: 'FULL' });
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
        ownerProfileId: 'owner-1',
        now: new Date(startsAt.getTime() + 60_000),
      })
    ).toBe(true);

    expect(
      isPublicBookingAvailable({
        subscriptionStatus: SubscriptionStatus.TRIAL,
        trialEndsAt: endsAt,
        ownerProfileId: 'owner-1',
        now: new Date(endsAt.getTime() + 1),
      })
    ).toBe(true);
  });
});

describe('isPublicBookingAvailable baseline', () => {
  it('allows booking for active subscription', () => {
    expect(
      isPublicBookingAvailable({
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        trialEndsAt: null,
        ownerProfileId: 'owner-1',
        now,
      })
    ).toBe(true);
  });

  it('blocks booking when standard trial expired without owner', () => {
    expect(
      isPublicBookingAvailable({
        subscriptionStatus: SubscriptionStatus.TRIAL,
        trialEndsAt: expiredPlaceholderTrial,
        ownerProfileId: null,
        now,
      })
    ).toBe(false);
  });

  it('14. public booking remains available during activated Practice grace', () => {
    expect(
      isPublicBookingAvailable({
        subscriptionStatus: SubscriptionStatus.TRIAL,
        trialEndsAt: expiredPlaceholderTrial,
        ownerProfileId: 'owner-1',
        now,
      })
    ).toBe(true);
  });

  it('blocks booking when billing restricted', () => {
    expect(
      isPublicBookingAvailable({
        subscriptionStatus: SubscriptionStatus.SUSPENDED,
        trialEndsAt: expiredPlaceholderTrial,
        ownerProfileId: 'owner-1',
        subscriptionSuspensionReason: SubscriptionSuspensionReason.BILLING_OVERDUE,
        now,
      })
    ).toBe(false);
  });

  it('blocks booking for manual suspension', () => {
    expect(
      isPublicBookingAvailable({
        subscriptionStatus: SubscriptionStatus.SUSPENDED,
        trialEndsAt: null,
        ownerProfileId: 'owner-1',
        subscriptionSuspensionReason: SubscriptionSuspensionReason.MANUAL,
        now,
      })
    ).toBe(false);
  });
});
