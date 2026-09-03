import type { AuthUser, PracticeAccessMode, PracticeAccessReason, PracticeAccessState } from './types';

export const PRACTICE_ACCESS_CHANGED_EVENT = 'medinathi:practice-access-changed';

export type PracticeAccessView = {
  mode: PracticeAccessMode;
  reason: PracticeAccessReason;
  suspendedAt: string | null;
  isReadOnly: boolean;
  isBlocked: boolean;
  canMutate: boolean;
};

const DEFAULT_FULL: PracticeAccessView = {
  mode: 'FULL',
  reason: null,
  suspendedAt: null,
  isReadOnly: false,
  isBlocked: false,
  canMutate: true,
};

export function resolvePracticeAccess(user: AuthUser | null | undefined): PracticeAccessView {
  const access = user?.practice?.access;
  if (!access?.mode) return DEFAULT_FULL;
  const mode = access.mode;
  return {
    mode,
    reason: access.reason ?? null,
    suspendedAt: access.suspended_at ?? null,
    isReadOnly: mode === 'READ_ONLY',
    isBlocked: mode === 'BLOCKED',
    canMutate: mode === 'FULL',
  };
}

export function staffReadOnlyMessage(): string {
  return 'Practice is in read-only mode because the subscription payment is overdue. Existing records remain available. New clinical and operational changes, AI and telemedicine are temporarily disabled.';
}

export function patientReadOnlyMessage(): string {
  return 'Some Practice features are temporarily unavailable. Your existing records remain available. Contact the Practice for assistance.';
}

export function blockedAccessMessage(reason: PracticeAccessReason): string {
  if (reason === 'CANCELLED') {
    return 'This Practice has been cancelled. Please contact support.';
  }
  if (reason === 'ONBOARDING_TRIAL_EXPIRED') {
    return 'This Practice trial has ended. Please contact support.';
  }
  return 'This Practice is currently suspended. Please contact support.';
}

export function mutationUnavailableHint(user: AuthUser | null | undefined): string {
  const access = resolvePracticeAccess(user);
  if (access.mode === 'READ_ONLY') {
    return user?.role === 'PATIENT'
      ? 'This action is temporarily unavailable. Existing records remain available.'
      : 'This action is unavailable while the Practice is in read-only mode.';
  }
  if (access.mode === 'BLOCKED') {
    return blockedAccessMessage(access.reason);
  }
  return '';
}

export type RestrictionBanner = {
  kind: 'trial' | 'read_only' | 'blocked';
  message: string;
  showBillingLink: boolean;
};

export function dashboardRestrictionBanner(params: {
  user: AuthUser | null | undefined;
  trialDaysLeft: number | null;
}): RestrictionBanner | null {
  const access = resolvePracticeAccess(params.user);
  if (access.mode === 'READ_ONLY') {
    const isPatient = params.user?.role === 'PATIENT';
    return {
      kind: 'read_only',
      message: isPatient ? patientReadOnlyMessage() : staffReadOnlyMessage(),
      showBillingLink: Boolean(params.user?.is_practice_owner) && !isPatient,
    };
  }
  if (access.mode === 'BLOCKED') {
    return {
      kind: 'blocked',
      message: blockedAccessMessage(access.reason),
      showBillingLink: false,
    };
  }
  if (params.trialDaysLeft !== null) {
    return {
      kind: 'trial',
      message: `Trial ends in ${params.trialDaysLeft} day${params.trialDaysLeft === 1 ? '' : 's'}. Contact platform support to activate your subscription.`,
      showBillingLink: false,
    };
  }
  return null;
}

export function shouldRefreshPracticeAccessOnce(params: {
  inFlight: boolean;
  user: AuthUser | null | undefined;
}): boolean {
  if (params.inFlight) return false;
  if (params.user && !resolvePracticeAccess(params.user).canMutate) return false;
  return true;
}

export const PAYMENT_REPORTED_READONLY_COPY =
  'Payment reported. The Practice remains in read-only mode until the payment is verified and MediNathi reactivates the Practice.';

export const PAYMENT_VERIFIED_PENDING_REACTIVATION_COPY =
  'Payment verified. Reactivation is pending MediNathi.';

export function notifyPracticeAccessChanged(detail: { code?: string; access_mode?: string }) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PRACTICE_ACCESS_CHANGED_EVENT, { detail }));
}

export function isPracticeAccessState(value: unknown): value is PracticeAccessState {
  if (!value || typeof value !== 'object') return false;
  const mode = (value as PracticeAccessState).mode;
  return mode === 'FULL' || mode === 'READ_ONLY' || mode === 'BLOCKED';
}
