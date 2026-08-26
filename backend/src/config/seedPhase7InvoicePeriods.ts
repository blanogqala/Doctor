import {
  computeSubscriptionInvoiceDueAt,
  paidSubscriptionPeriodFromStart,
} from '../services/subscriptionInvoiceService';

export const PHASE7_SEED_INVOICE_NUMBERS = [
  'MS-SEED-PAID-001',
  'MS-SEED-REPORTED-001',
  'MS-SEED-DUE-001',
] as const;

export interface SeedInvoicePeriod {
  periodStart: Date;
  periodEnd: Date;
  dueAt: Date;
}

export interface Phase7DemoSeedInvoicePeriods {
  /** Oldest historical period — PAID */
  paid: SeedInvoicePeriod;
  /** Middle period — PAYMENT_REPORTED */
  reported: SeedInvoicePeriod;
  /** Latest period — DUE */
  due: SeedInvoicePeriod;
  /** Trial ended at the start of the first paid period (historical demo). */
  trialEndsAt: Date;
}

function dayAfter(periodEnd: Date): Date {
  return new Date(periodEnd.getTime() + 24 * 60 * 60 * 1000);
}

function withDue(period: { periodStart: Date; periodEnd: Date }): SeedInvoicePeriod {
  return {
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    dueAt: computeSubscriptionInvoiceDueAt(period.periodStart),
  };
}

/**
 * Three sequential non-overlapping Phase 7.3 paid periods for fictional MS-SEED invoices.
 * Anchor is ~3 calendar months before `now` on the same UTC day-of-month (default 8).
 */
export function buildPhase7DemoSeedInvoicePeriods(now = new Date()): Phase7DemoSeedInvoicePeriods {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const day = 8;
  const paidAnchor = new Date(Date.UTC(y, m - 3, day));

  const paid = withDue(paidSubscriptionPeriodFromStart(paidAnchor));
  const reported = withDue(paidSubscriptionPeriodFromStart(dayAfter(paid.periodEnd)));
  const due = withDue(paidSubscriptionPeriodFromStart(dayAfter(reported.periodEnd)));

  return {
    paid,
    reported,
    due,
    trialEndsAt: paid.periodStart,
  };
}

/** Lightweight invariant: three distinct non-overlapping periods. */
export function assertPhase7DemoSeedPeriodsUnique(
  periods: Phase7DemoSeedInvoicePeriods
): void {
  const keys = [
    `${periods.paid.periodStart.toISOString()}|${periods.paid.periodEnd.toISOString()}`,
    `${periods.reported.periodStart.toISOString()}|${periods.reported.periodEnd.toISOString()}`,
    `${periods.due.periodStart.toISOString()}|${periods.due.periodEnd.toISOString()}`,
  ];
  if (new Set(keys).size !== 3) {
    throw new Error('Phase 7 seed invoice periods must be unique');
  }
  if (periods.paid.periodEnd.getTime() >= periods.reported.periodStart.getTime()) {
    throw new Error('PAID period overlaps REPORTED period');
  }
  if (periods.reported.periodEnd.getTime() >= periods.due.periodStart.getTime()) {
    throw new Error('REPORTED period overlaps DUE period');
  }
}
