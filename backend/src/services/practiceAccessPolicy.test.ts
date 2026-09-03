import { describe, expect, it } from 'vitest';
import {
  SubscriptionStatus,
  SubscriptionSuspensionReason,
} from '@prisma/client';
import {
  blockedErrorCode,
  derivePracticeAccess,
  isBillingRecoveryOrSecurityPath,
  isPracticeAccessEnforcementSkip,
  isPracticeAccessFull,
  isReadOnlyAllowedMutation,
  readOnlyErrorMessage,
  serializePracticeAccessForRole,
} from './practiceAccessPolicy';

const now = new Date('2026-09-20T12:00:00.000Z');
const past = new Date('2026-09-10T00:00:00.000Z');
const future = new Date('2026-09-30T00:00:00.000Z');

function fields(
  overrides: Partial<Parameters<typeof derivePracticeAccess>[0]> = {}
) {
  return {
    subscriptionStatus: SubscriptionStatus.ACTIVE,
    subscriptionSuspensionReason: null,
    subscriptionSuspendedAt: null,
    trialEndsAt: null,
    ownerProfileId: 'owner-1',
    ...overrides,
  };
}

describe('derivePracticeAccess', () => {
  it('1. ACTIVE → FULL', () => {
    expect(derivePracticeAccess(fields(), now)).toMatchObject({
      mode: 'FULL',
      reason: null,
    });
  });

  it('2. non-expired TRIAL → FULL', () => {
    expect(
      derivePracticeAccess(
        fields({
          subscriptionStatus: SubscriptionStatus.TRIAL,
          trialEndsAt: future,
          ownerProfileId: null,
        }),
        now
      )
    ).toMatchObject({ mode: 'FULL', reason: null });
  });

  it('3. expired TRIAL + activated Owner → FULL payment grace', () => {
    expect(
      derivePracticeAccess(
        fields({
          subscriptionStatus: SubscriptionStatus.TRIAL,
          trialEndsAt: past,
          ownerProfileId: 'owner-1',
        }),
        now
      )
    ).toMatchObject({ mode: 'FULL', reason: null });
  });

  it('4. expired TRIAL + no Owner → BLOCKED onboarding/trial expired', () => {
    expect(
      derivePracticeAccess(
        fields({
          subscriptionStatus: SubscriptionStatus.TRIAL,
          trialEndsAt: past,
          ownerProfileId: null,
        }),
        now
      )
    ).toMatchObject({
      mode: 'BLOCKED',
      reason: 'ONBOARDING_TRIAL_EXPIRED',
    });
  });

  it('5. SUSPENDED + BILLING_OVERDUE → READ_ONLY', () => {
    const suspendedAt = new Date('2026-09-19T00:00:00.000Z');
    expect(
      derivePracticeAccess(
        fields({
          subscriptionStatus: SubscriptionStatus.SUSPENDED,
          subscriptionSuspensionReason: SubscriptionSuspensionReason.BILLING_OVERDUE,
          subscriptionSuspendedAt: suspendedAt,
        }),
        now
      )
    ).toEqual({
      mode: 'READ_ONLY',
      reason: 'BILLING_OVERDUE',
      suspendedAt,
    });
  });

  it('6. SUSPENDED + MANUAL → BLOCKED', () => {
    expect(
      derivePracticeAccess(
        fields({
          subscriptionStatus: SubscriptionStatus.SUSPENDED,
          subscriptionSuspensionReason: SubscriptionSuspensionReason.MANUAL,
        }),
        now
      )
    ).toMatchObject({ mode: 'BLOCKED', reason: 'MANUAL_SUSPENSION' });
  });

  it('7. legacy SUSPENDED + null reason → BLOCKED', () => {
    expect(
      derivePracticeAccess(
        fields({
          subscriptionStatus: SubscriptionStatus.SUSPENDED,
          subscriptionSuspensionReason: null,
        }),
        now
      )
    ).toMatchObject({ mode: 'BLOCKED', reason: 'MANUAL_SUSPENSION' });
  });

  it('8. CANCELLED → BLOCKED', () => {
    expect(
      derivePracticeAccess(
        fields({ subscriptionStatus: SubscriptionStatus.CANCELLED }),
        now
      )
    ).toMatchObject({ mode: 'BLOCKED', reason: 'CANCELLED' });
  });

  it('PENDING_ACTIVATION unexpired placeholder trial remains FULL', () => {
    expect(
      isPracticeAccessFull(
        fields({
          subscriptionStatus: SubscriptionStatus.TRIAL,
          trialEndsAt: future,
          ownerProfileId: null,
        }),
        now
      )
    ).toBe(true);
  });
});

describe('error copy and codes', () => {
  it('uses distinct blocked codes', () => {
    expect(blockedErrorCode('CANCELLED')).toBe('PRACTICE_CANCELLED');
    expect(blockedErrorCode('MANUAL_SUSPENSION')).toBe('PRACTICE_SUSPENDED');
    expect(blockedErrorCode('ONBOARDING_TRIAL_EXPIRED')).toBe('TRIAL_EXPIRED');
  });

  it('does not disclose billing to patients', () => {
    expect(readOnlyErrorMessage('PATIENT')).toContain('temporarily unavailable');
    expect(readOnlyErrorMessage('PATIENT')).not.toMatch(/overdue|invoice|unpaid/i);
    expect(readOnlyErrorMessage('DOCTOR')).toContain('read-only');
  });

  it('serializes patient access without billing reason', () => {
    const access = derivePracticeAccess(
      fields({
        subscriptionStatus: SubscriptionStatus.SUSPENDED,
        subscriptionSuspensionReason: SubscriptionSuspensionReason.BILLING_OVERDUE,
        subscriptionSuspendedAt: now,
      }),
      now
    );
    expect(serializePracticeAccessForRole(access, 'PATIENT')).toEqual({
      mode: 'READ_ONLY',
      reason: null,
      suspended_at: null,
    });
    expect(serializePracticeAccessForRole(access, 'DOCTOR').reason).toBe('BILLING_OVERDUE');
  });
});

describe('allowlists', () => {
  it('skips public, invitations, activations, super-admin, health', () => {
    expect(isPracticeAccessEnforcementSkip({ path: '/api/public/practice-info' })).toBe(true);
    expect(isPracticeAccessEnforcementSkip({ path: '/api/invitations/accept' })).toBe(true);
    expect(isPracticeAccessEnforcementSkip({ path: '/api/activations/accept' })).toBe(true);
    expect(isPracticeAccessEnforcementSkip({ path: '/api/super-admin/billing' })).toBe(true);
    expect(isPracticeAccessEnforcementSkip({ path: '/health' })).toBe(true);
    expect(isPracticeAccessEnforcementSkip({ path: '/api/patients' })).toBe(false);
  });

  it('allows security and billing recovery paths', () => {
    expect(isBillingRecoveryOrSecurityPath('POST', '/api/auth/login')).toBe(true);
    expect(isBillingRecoveryOrSecurityPath('POST', '/api/auth/change-password')).toBe(true);
    expect(isBillingRecoveryOrSecurityPath('GET', '/api/auth/me')).toBe(true);
    expect(
      isBillingRecoveryOrSecurityPath(
        'POST',
        '/api/practice-management/invoices/abc/report-payment'
      )
    ).toBe(true);
    expect(isBillingRecoveryOrSecurityPath('POST', '/api/auth/register')).toBe(false);
  });

  it('allows mark-read in READ_ONLY but not new messages', () => {
    expect(isReadOnlyAllowedMutation('PATCH', '/api/messages/msg-1/read')).toBe(true);
    expect(isReadOnlyAllowedMutation('POST', '/api/messages')).toBe(false);
    expect(isReadOnlyAllowedMutation('POST', '/api/messages/start-admin')).toBe(false);
  });
});
