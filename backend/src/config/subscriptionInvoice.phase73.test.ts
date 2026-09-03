import { describe, expect, it } from 'vitest';
import { SubscriptionStatus } from '@prisma/client';
import {
  computeSubscriptionInvoiceDueAt,
  isPracticeInvoiceEligible,
  paidSubscriptionPeriodFromStart,
} from '../services/subscriptionInvoiceService';
import { ownerBillingUrl } from './eftPayment';

describe('subscription invoice periods', () => {
  it('builds non-overlapping periods from trial end', () => {
    const start = new Date(Date.UTC(2026, 8, 8)); // 8 Sep 2026
    const first = paidSubscriptionPeriodFromStart(start);
    expect(first.periodStart.toISOString().slice(0, 10)).toBe('2026-09-08');
    expect(first.periodEnd.toISOString().slice(0, 10)).toBe('2026-10-07');

    const nextStart = new Date(first.periodEnd.getTime() + 24 * 60 * 60 * 1000);
    const second = paidSubscriptionPeriodFromStart(nextStart);
    expect(second.periodStart.toISOString().slice(0, 10)).toBe('2026-10-08');
    expect(second.periodEnd.toISOString().slice(0, 10)).toBe('2026-11-07');
  });

  it('does not mark due until end of due day (SAST)', () => {
    const periodStart = new Date(Date.UTC(2026, 8, 1));
    const dueAt = computeSubscriptionInvoiceDueAt(periodStart, 14);
    // periodStart + 14 days = 15 Sep; end of SAST day = 21:59:59.999Z
    expect(dueAt.toISOString()).toBe('2026-09-15T21:59:59.999Z');
    const morningOfDueDay = new Date('2026-09-15T08:00:00.000Z');
    expect(morningOfDueDay.getTime() < dueAt.getTime()).toBe(true);
  });

  it('blocks invoices during free trial', () => {
    const trialEndsAt = new Date('2026-09-10T00:00:00.000Z');
    expect(
      isPracticeInvoiceEligible(
        { trialEndsAt, subscriptionStatus: SubscriptionStatus.TRIAL },
        new Date('2026-09-03T00:00:00.000Z')
      )
    ).toBe(false);
    expect(
      isPracticeInvoiceEligible(
        { trialEndsAt, subscriptionStatus: SubscriptionStatus.TRIAL },
        new Date('2026-09-10T00:00:00.000Z')
      )
    ).toBe(true);
  });

  it('blocks invoices during active 30-day pilot', () => {
    const trialEndsAt = new Date('2026-10-15T00:00:00.000Z');
    expect(
      isPracticeInvoiceEligible(
        { trialEndsAt, subscriptionStatus: SubscriptionStatus.TRIAL },
        new Date('2026-10-01T00:00:00.000Z')
      )
    ).toBe(false);
  });

  it('10. PENDING_ACTIVATION Pilot is not invoice eligible after placeholder expiry', () => {
    expect(
      isPracticeInvoiceEligible(
        {
          trialEndsAt: new Date('2026-09-01T00:00:00.000Z'),
          subscriptionStatus: SubscriptionStatus.TRIAL,
          pilotProgramGrantedAt: new Date('2026-08-20T00:00:00.000Z'),
          pilotProgramStartsAt: null,
          pilotProgramEndsAt: null,
        },
        new Date('2026-09-20T00:00:00.000Z')
      )
    ).toBe(false);
  });

  it('9. active 30-day Pilot is not invoice eligible before pilot end', () => {
    const granted = new Date('2026-09-01T00:00:00.000Z');
    const starts = new Date('2026-09-02T00:00:00.000Z');
    const ends = new Date('2026-10-02T00:00:00.000Z');
    expect(
      isPracticeInvoiceEligible(
        {
          trialEndsAt: ends,
          subscriptionStatus: SubscriptionStatus.TRIAL,
          pilotProgramGrantedAt: granted,
          pilotProgramStartsAt: starts,
          pilotProgramEndsAt: ends,
        },
        new Date('2026-09-15T00:00:00.000Z')
      )
    ).toBe(false);
  });
});

describe('ownerBillingUrl', () => {
  it('embeds practice subdomain on localhost', () => {
    const url = ownerBillingUrl('cape-medical');
    expect(url).toContain('cape-medical.localhost:3000');
    expect(url).toContain('/doctor/practice-management');
    expect(url).not.toMatch(/token=|password|jwt/i);
  });

  it('produces distinct tenant hosts', () => {
    expect(ownerBillingUrl('cape-medical')).not.toBe(ownerBillingUrl('other-clinic'));
  });
});
