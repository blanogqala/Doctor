import { describe, expect, it } from 'vitest';
import { SubscriptionInvoiceStatus, SubscriptionStatus } from '@prisma/client';

/**
 * Pure helpers mirroring Phase 7.2 payment / overdue / trial rules.
 * Runtime DB behavior is covered by integration tests when RUN_INTEGRATION=1.
 */

function nextStatusAfterPaymentVerify(current: SubscriptionStatus): SubscriptionStatus {
  if (current === SubscriptionStatus.TRIAL) return SubscriptionStatus.ACTIVE;
  // SUSPENDED and others remain unchanged
  return current;
}

function shouldBecomeOverdue(status: SubscriptionInvoiceStatus, dueAt: Date, now: Date): boolean {
  return status === SubscriptionInvoiceStatus.DUE && dueAt < now;
}

function isTrialEndingSoon(trialEndsAt: Date | null, now: Date, soon: Date): boolean {
  if (!trialEndsAt) return false;
  return trialEndsAt >= now && trialEndsAt <= soon;
}

describe('Phase 7.2 payment verification status rules', () => {
  it('activates TRIAL on verified payment', () => {
    expect(nextStatusAfterPaymentVerify(SubscriptionStatus.TRIAL)).toBe(SubscriptionStatus.ACTIVE);
  });

  it('does not auto-reactivate SUSPENDED on verified payment', () => {
    expect(nextStatusAfterPaymentVerify(SubscriptionStatus.SUSPENDED)).toBe(
      SubscriptionStatus.SUSPENDED
    );
  });

  it('leaves ACTIVE unchanged', () => {
    expect(nextStatusAfterPaymentVerify(SubscriptionStatus.ACTIVE)).toBe(SubscriptionStatus.ACTIVE);
  });
});

describe('Phase 7.2 overdue invoice rules', () => {
  const now = new Date('2026-08-25T12:00:00.000Z');

  it('marks past-due DUE as overdue candidate', () => {
    expect(
      shouldBecomeOverdue(
        SubscriptionInvoiceStatus.DUE,
        new Date('2026-08-20T00:00:00.000Z'),
        now
      )
    ).toBe(true);
  });

  it('keeps future DUE as not overdue', () => {
    expect(
      shouldBecomeOverdue(
        SubscriptionInvoiceStatus.DUE,
        new Date('2026-08-30T00:00:00.000Z'),
        now
      )
    ).toBe(false);
  });

  it('never marks PAYMENT_REPORTED / PAID / VOID as overdue', () => {
    const past = new Date('2026-08-01T00:00:00.000Z');
    expect(shouldBecomeOverdue(SubscriptionInvoiceStatus.PAYMENT_REPORTED, past, now)).toBe(false);
    expect(shouldBecomeOverdue(SubscriptionInvoiceStatus.PAID, past, now)).toBe(false);
    expect(shouldBecomeOverdue(SubscriptionInvoiceStatus.VOID, past, now)).toBe(false);
  });
});

describe('Phase 7.2 trials ending soon', () => {
  const now = new Date('2026-08-25T12:00:00.000Z');
  const soon = new Date('2026-09-01T12:00:00.000Z');

  it('includes trial ending tomorrow', () => {
    expect(isTrialEndingSoon(new Date('2026-08-26T12:00:00.000Z'), now, soon)).toBe(true);
  });

  it('excludes trial ending in 10 days', () => {
    expect(isTrialEndingSoon(new Date('2026-09-04T12:00:00.000Z'), now, soon)).toBe(false);
  });

  it('excludes expired trials', () => {
    expect(isTrialEndingSoon(new Date('2026-08-24T12:00:00.000Z'), now, soon)).toBe(false);
    expect(isTrialEndingSoon(new Date('2026-07-25T12:00:00.000Z'), now, soon)).toBe(false);
  });
});
