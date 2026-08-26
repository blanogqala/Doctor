import { describe, expect, it } from 'vitest';
import {
  assertPhase7DemoSeedPeriodsUnique,
  buildPhase7DemoSeedInvoicePeriods,
} from './seedPhase7InvoicePeriods';

describe('buildPhase7DemoSeedInvoicePeriods', () => {
  it('produces three unique non-overlapping sequential periods', () => {
    const periods = buildPhase7DemoSeedInvoicePeriods(
      new Date(Date.UTC(2026, 8, 25)) // 25 Sep 2026
    );

    expect(periods.paid.periodStart.toISOString().slice(0, 10)).toBe('2026-06-08');
    expect(periods.paid.periodEnd.toISOString().slice(0, 10)).toBe('2026-07-07');
    expect(periods.reported.periodStart.toISOString().slice(0, 10)).toBe('2026-07-08');
    expect(periods.reported.periodEnd.toISOString().slice(0, 10)).toBe('2026-08-07');
    expect(periods.due.periodStart.toISOString().slice(0, 10)).toBe('2026-08-08');
    expect(periods.due.periodEnd.toISOString().slice(0, 10)).toBe('2026-09-07');

    expect(periods.trialEndsAt.toISOString()).toBe(periods.paid.periodStart.toISOString());

    expect(() => assertPhase7DemoSeedPeriodsUnique(periods)).not.toThrow();

    const triples = [
      [periods.paid.periodStart.getTime(), periods.paid.periodEnd.getTime()],
      [periods.reported.periodStart.getTime(), periods.reported.periodEnd.getTime()],
      [periods.due.periodStart.getTime(), periods.due.periodEnd.getTime()],
    ];
    expect(new Set(triples.map(([a, b]) => `${a}|${b}`)).size).toBe(3);
  });
});
