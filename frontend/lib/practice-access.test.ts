import { describe, expect, it } from 'vitest';
import type { AuthUser } from './types';
import {
  PAYMENT_REPORTED_READONLY_COPY,
  PAYMENT_VERIFIED_PENDING_REACTIVATION_COPY,
  patientReadOnlyMessage,
  resolvePracticeAccess,
  shouldRefreshPracticeAccessOnce,
  staffReadOnlyMessage,
} from './practice-access';

function user(overrides: Partial<AuthUser> & { practice?: AuthUser['practice'] }): AuthUser {
  return {
    id: 'u1',
    email: 'a@example.com',
    role: 'DOCTOR',
    profile: null,
    doctor: null,
    patient: null,
    is_practice_owner: false,
    practice: {
      id: 'p1',
      subdomain: 'clinic',
      clinic_name: 'Clinic',
      logo_url: null,
      brand_color: '#1E40AF',
      subscription_status: 'ACTIVE',
      trial_ends_at: null,
      subscription_ends_at: null,
      ...overrides.practice,
    },
    ...overrides,
  };
}

describe('resolvePracticeAccess', () => {
  it('1. treats missing access as FULL', () => {
    expect(resolvePracticeAccess(user({}))).toMatchObject({
      mode: 'FULL',
      canMutate: true,
      isReadOnly: false,
    });
  });

  it('returns READ_ONLY helpers', () => {
    const access = resolvePracticeAccess(
      user({
        practice: {
          id: 'p1',
          subdomain: 'clinic',
          clinic_name: 'Clinic',
          logo_url: null,
          brand_color: '#1E40AF',
          subscription_status: 'SUSPENDED',
          trial_ends_at: null,
          subscription_ends_at: null,
          access: { mode: 'READ_ONLY', reason: 'BILLING_OVERDUE', suspended_at: '2026-09-20T00:00:00.000Z' },
        },
      })
    );
    expect(access).toMatchObject({
      mode: 'READ_ONLY',
      isReadOnly: true,
      canMutate: false,
      reason: 'BILLING_OVERDUE',
    });
  });

  it('4. patient copy does not disclose overdue billing', () => {
    expect(patientReadOnlyMessage()).not.toMatch(/overdue|invoice|unpaid|billing/i);
    expect(staffReadOnlyMessage()).toMatch(/overdue/i);
  });
});

import { dashboardRestrictionBanner } from './practice-access';

describe('dashboardRestrictionBanner', () => {
  it('2. Doctor/Reception READ_ONLY banner mentions overdue', () => {
    const banner = dashboardRestrictionBanner({
      user: user({
        role: 'ADMIN',
        practice: {
          id: 'p1',
          subdomain: 'clinic',
          clinic_name: 'Clinic',
          logo_url: null,
          brand_color: '#1E40AF',
          subscription_status: 'SUSPENDED',
          trial_ends_at: null,
          subscription_ends_at: null,
          access: { mode: 'READ_ONLY', reason: 'BILLING_OVERDUE' },
        },
      }),
      trialDaysLeft: null,
    });
    expect(banner?.kind).toBe('read_only');
    expect(banner?.message).toMatch(/overdue/i);
    expect(banner?.showBillingLink).toBe(false);
  });

  it('3. Owner banner includes Billing link', () => {
    const banner = dashboardRestrictionBanner({
      user: user({
        role: 'DOCTOR',
        is_practice_owner: true,
        practice: {
          id: 'p1',
          subdomain: 'clinic',
          clinic_name: 'Clinic',
          logo_url: null,
          brand_color: '#1E40AF',
          subscription_status: 'SUSPENDED',
          trial_ends_at: null,
          subscription_ends_at: null,
          access: { mode: 'READ_ONLY', reason: 'BILLING_OVERDUE' },
        },
      }),
      trialDaysLeft: null,
    });
    expect(banner?.showBillingLink).toBe(true);
  });

  it('4. Patient banner does not disclose overdue billing', () => {
    const banner = dashboardRestrictionBanner({
      user: user({
        role: 'PATIENT',
        practice: {
          id: 'p1',
          subdomain: 'clinic',
          clinic_name: 'Clinic',
          logo_url: null,
          brand_color: '#1E40AF',
          subscription_status: 'SUSPENDED',
          trial_ends_at: null,
          subscription_ends_at: null,
          access: { mode: 'READ_ONLY' },
        },
      }),
      trialDaysLeft: null,
    });
    expect(banner?.message).not.toMatch(/overdue|invoice|unpaid/i);
    expect(banner?.showBillingLink).toBe(false);
  });
});

describe('shouldRefreshPracticeAccessOnce', () => {
  it('skips when a refresh is already in flight', () => {
    expect(shouldRefreshPracticeAccessOnce({ inFlight: true, user: user({}) })).toBe(false);
  });

  it('skips when the session is already not FULL', () => {
    expect(
      shouldRefreshPracticeAccessOnce({
        inFlight: false,
        user: user({
          practice: {
            id: 'p1',
            subdomain: 'clinic',
            clinic_name: 'Clinic',
            logo_url: null,
            brand_color: '#1E40AF',
            subscription_status: 'SUSPENDED',
            trial_ends_at: null,
            subscription_ends_at: null,
            access: { mode: 'READ_ONLY', reason: 'BILLING_OVERDUE' },
          },
        }),
      })
    ).toBe(false);
  });

  it('refreshes once from a FULL session', () => {
    expect(shouldRefreshPracticeAccessOnce({ inFlight: false, user: user({}) })).toBe(true);
  });
});

describe('Practice Management billing copy', () => {
  it('does not promise instant reactivation', () => {
    expect(PAYMENT_REPORTED_READONLY_COPY).toMatch(/read-only/i);
    expect(PAYMENT_REPORTED_READONLY_COPY).not.toMatch(/immediately|automatically reactivat/i);
    expect(PAYMENT_VERIFIED_PENDING_REACTIVATION_COPY).toMatch(/pending/i);
    expect(PAYMENT_VERIFIED_PENDING_REACTIVATION_COPY).not.toMatch(/immediately|automatically reactivat/i);
  });
});

describe('mutation surfaces', () => {
  it('canMutate is true only for FULL access', () => {
    expect(resolvePracticeAccess(user({})).canMutate).toBe(true);
    expect(
      resolvePracticeAccess(
        user({
          practice: {
            id: 'p1',
            subdomain: 'clinic',
            clinic_name: 'Clinic',
            logo_url: null,
            brand_color: '#1E40AF',
            subscription_status: 'SUSPENDED',
            trial_ends_at: null,
            subscription_ends_at: null,
            access: { mode: 'READ_ONLY', reason: 'BILLING_OVERDUE' },
          },
        })
      ).canMutate
    ).toBe(false);
  });
});
