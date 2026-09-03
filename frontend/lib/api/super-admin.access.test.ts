import { describe, expect, it } from 'vitest';
import {
  PAYMENT_VERIFIED_REMAINS_READONLY,
  SuperAdminApiError,
  isBillingRestrictedPractice,
} from './super-admin';

describe('Super Admin billing access helpers', () => {
  it('labels billing-restricted vs manually suspended', () => {
    expect(
      isBillingRestrictedPractice({
        subscription_status: 'SUSPENDED',
        subscription_suspension_reason: 'BILLING_OVERDUE',
      })
    ).toBe(true);
    expect(
      isBillingRestrictedPractice({
        subscription_status: 'SUSPENDED',
        access: { reason: 'BILLING_OVERDUE' },
      })
    ).toBe(true);
    expect(
      isBillingRestrictedPractice({
        subscription_status: 'SUSPENDED',
        subscription_suspension_reason: 'MANUAL',
      })
    ).toBe(false);
    expect(isBillingRestrictedPractice({ subscription_status: 'ACTIVE' })).toBe(false);
  });

  it('preserves OUTSTANDING_SUBSCRIPTION_PAYMENT on SuperAdminApiError', () => {
    const err = new SuperAdminApiError('Cannot reactivate', 409, 'OUTSTANDING_SUBSCRIPTION_PAYMENT');
    expect(err.status).toBe(409);
    expect(err.code).toBe('OUTSTANDING_SUBSCRIPTION_PAYMENT');
  });

  it('verify copy states read-only until reactivation', () => {
    expect(PAYMENT_VERIFIED_REMAINS_READONLY).toMatch(/read-only/i);
    expect(PAYMENT_VERIFIED_REMAINS_READONLY).toMatch(/reactivated/i);
  });
});
