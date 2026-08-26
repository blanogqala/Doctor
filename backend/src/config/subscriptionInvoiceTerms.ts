/**
 * Central subscription invoice payment-term configuration.
 * dueAt is computed from period start + these days, ending at end-of-day Africa/Johannesburg.
 */
export const SUBSCRIPTION_INVOICE_BUSINESS_TIMEZONE = 'Africa/Johannesburg';

/** Default payment terms (days from paid-period start / invoice issue). Override via env. */
export function getSubscriptionInvoiceDueDays(): number {
  const raw = process.env.SUBSCRIPTION_INVOICE_DUE_DAYS?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0 && n <= 90) return Math.floor(n);
  }
  // Dev/staging default: 14 days from period start
  return 14;
}
