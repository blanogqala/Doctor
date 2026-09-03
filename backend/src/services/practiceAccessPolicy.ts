import {
  SubscriptionStatus,
  SubscriptionSuspensionReason,
  UserRole,
} from '@prisma/client';
import { AppError } from '../middleware/errorHandler';

export type PracticeAccessMode = 'FULL' | 'READ_ONLY' | 'BLOCKED';

export type PracticeAccessReason =
  | 'BILLING_OVERDUE'
  | 'MANUAL_SUSPENSION'
  | 'CANCELLED'
  | 'ONBOARDING_TRIAL_EXPIRED'
  | null;

export type PracticeAccessFields = {
  subscriptionStatus: SubscriptionStatus;
  subscriptionSuspensionReason?: SubscriptionSuspensionReason | null;
  subscriptionSuspendedAt?: Date | null;
  trialEndsAt: Date | null;
  ownerProfileId: string | null;
};

export type PracticeAccessState = {
  mode: PracticeAccessMode;
  reason: PracticeAccessReason;
  suspendedAt: Date | null;
};

export const READ_ONLY_STAFF_MESSAGE =
  'This Practice is temporarily in read-only mode.';
export const READ_ONLY_PATIENT_MESSAGE =
  'Some Practice features are temporarily unavailable. Existing records remain available. Please contact the Practice for assistance.';
export const BLOCKED_SUSPENDED_MESSAGE =
  'This Practice is currently suspended. Please contact support.';
export const BLOCKED_CANCELLED_MESSAGE =
  'This Practice has been cancelled. Please contact support.';
export const BLOCKED_TRIAL_EXPIRED_MESSAGE =
  'Trial expired. Please subscribe to continue.';
export const INVITE_BLOCKED_MESSAGE =
  'This invitation cannot be accepted while Practice access is restricted.';
export const ACTIVATION_BLOCKED_MESSAGE =
  'This activation cannot be completed while Practice access is restricted.';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function derivePracticeAccess(
  practice: PracticeAccessFields,
  now: Date = new Date()
): PracticeAccessState {
  const suspendedAt = practice.subscriptionSuspendedAt ?? null;

  if (practice.subscriptionStatus === SubscriptionStatus.CANCELLED) {
    return { mode: 'BLOCKED', reason: 'CANCELLED', suspendedAt };
  }

  if (practice.subscriptionStatus === SubscriptionStatus.SUSPENDED) {
    if (practice.subscriptionSuspensionReason === SubscriptionSuspensionReason.BILLING_OVERDUE) {
      return { mode: 'READ_ONLY', reason: 'BILLING_OVERDUE', suspendedAt };
    }
    return { mode: 'BLOCKED', reason: 'MANUAL_SUSPENSION', suspendedAt };
  }

  if (practice.subscriptionStatus === SubscriptionStatus.TRIAL) {
    const trialExpired =
      practice.trialEndsAt != null && practice.trialEndsAt.getTime() < now.getTime();
    if (trialExpired && !practice.ownerProfileId) {
      return { mode: 'BLOCKED', reason: 'ONBOARDING_TRIAL_EXPIRED', suspendedAt: null };
    }
    return { mode: 'FULL', reason: null, suspendedAt: null };
  }

  return { mode: 'FULL', reason: null, suspendedAt: null };
}

export function isPracticeAccessFull(
  practice: PracticeAccessFields,
  now: Date = new Date()
): boolean {
  return derivePracticeAccess(practice, now).mode === 'FULL';
}

export function blockedErrorCode(reason: PracticeAccessReason): string {
  switch (reason) {
    case 'CANCELLED':
      return 'PRACTICE_CANCELLED';
    case 'ONBOARDING_TRIAL_EXPIRED':
      return 'TRIAL_EXPIRED';
    case 'MANUAL_SUSPENSION':
    default:
      return 'PRACTICE_SUSPENDED';
  }
}

export function blockedErrorMessage(reason: PracticeAccessReason): string {
  switch (reason) {
    case 'CANCELLED':
      return BLOCKED_CANCELLED_MESSAGE;
    case 'ONBOARDING_TRIAL_EXPIRED':
      return BLOCKED_TRIAL_EXPIRED_MESSAGE;
    case 'MANUAL_SUSPENSION':
    default:
      return BLOCKED_SUSPENDED_MESSAGE;
  }
}

export function readOnlyErrorMessage(role?: UserRole | string | null): string {
  if (role === UserRole.PATIENT || role === 'PATIENT') {
    return READ_ONLY_PATIENT_MESSAGE;
  }
  return READ_ONLY_STAFF_MESSAGE;
}

export function serializePracticeAccess(
  access: PracticeAccessState,
  options?: { includeBillingReason?: boolean }
): {
  mode: PracticeAccessMode;
  reason: PracticeAccessReason | null;
  suspended_at: string | null;
} {
  const includeReason = options?.includeBillingReason !== false;
  return {
    mode: access.mode,
    reason: includeReason ? access.reason : access.mode === 'READ_ONLY' ? null : access.reason,
    suspended_at: includeReason ? access.suspendedAt?.toISOString() ?? null : null,
  };
}

export function serializePracticeAccessForRole(
  access: PracticeAccessState,
  role?: UserRole | string | null
) {
  const isPatient = role === UserRole.PATIENT || role === 'PATIENT';
  if (isPatient) {
    return {
      mode: access.mode,
      reason: null,
      suspended_at: null,
    };
  }
  return serializePracticeAccess(access);
}

function pathOf(req: { path?: string; originalUrl?: string }): string {
  const raw = String(req.originalUrl || req.path || '').split('?')[0];
  return raw.replace(/\/$/, '') || '/';
}

export function isPracticeAccessEnforcementSkip(req: {
  path?: string;
  originalUrl?: string;
}): boolean {
  const path = pathOf(req);
  if (path === '/health' || path.startsWith('/health/')) return true;
  if (path.startsWith('/api/super-admin')) return true;
  if (path.startsWith('/api/invitations')) return true;
  if (path.startsWith('/api/activations')) return true;
  if (path.startsWith('/api/public')) return true;
  return false;
}

export function isSafeHttpMethod(method: string): boolean {
  return SAFE_METHODS.has(method.toUpperCase());
}

/**
 * Security, recovery, and harmless read-state mutations allowed in READ_ONLY
 * and (where currently permitted) BLOCKED recovery.
 */
export function isBillingRecoveryOrSecurityPath(
  method: string,
  pathname: string
): boolean {
  const m = method.toUpperCase();
  const path = pathname.replace(/\/$/, '') || '/';

  if (m === 'POST' && path === '/api/auth/login') return true;
  if (m === 'POST' && path === '/api/auth/forgot-password') return true;
  if (m === 'POST' && path === '/api/auth/reset-password') return true;
  if (m === 'POST' && path === '/api/auth/logout') return true;
  if (m === 'POST' && path === '/api/auth/change-password') return true;
  if (m === 'GET' && path === '/api/auth/me') return true;
  if (m === 'GET' && path === '/api/practice-management') return true;
  if (m === 'GET' && path === '/api/practice-management/eft-instructions') return true;
  if (m === 'POST' && /^\/api\/practice-management\/invoices\/[^/]+\/report-payment$/.test(path)) {
    return true;
  }
  return false;
}

/** Extra READ_ONLY mutation: mark an existing received message as read. */
export function isReadOnlyAllowedMutation(method: string, pathname: string): boolean {
  if (isBillingRecoveryOrSecurityPath(method, pathname)) return true;
  const m = method.toUpperCase();
  const path = pathname.replace(/\/$/, '') || '/';
  if (m === 'PATCH' && /^\/api\/messages\/[^/]+\/read$/.test(path)) return true;
  return false;
}

export function requestPathname(req: { path?: string; originalUrl?: string }): string {
  return pathOf(req);
}

export function assertInvitationAcceptanceAllowed(
  practice: PracticeAccessFields,
  isPracticeOwner: boolean
) {
  const access = derivePracticeAccess(practice);
  if (access.mode === 'FULL') return;
  if (isPracticeOwner && access.mode === 'READ_ONLY' && access.reason === 'BILLING_OVERDUE') {
    return;
  }
  // Owner activation remains available after placeholder/onboarding trial expiry (Block 2).
  if (isPracticeOwner && access.reason === 'ONBOARDING_TRIAL_EXPIRED') {
    return;
  }
  if (access.mode === 'READ_ONLY') {
    throw new AppError(403, INVITE_BLOCKED_MESSAGE, 'PRACTICE_READ_ONLY', {
      access_mode: 'READ_ONLY',
    });
  }
  throw new AppError(403, INVITE_BLOCKED_MESSAGE, blockedErrorCode(access.reason), {
    access_mode: 'BLOCKED',
  });
}

export function assertPatientActivationAllowed(practice: PracticeAccessFields) {
  const access = derivePracticeAccess(practice);
  if (access.mode === 'FULL' || access.mode === 'READ_ONLY') return;
  throw new AppError(403, ACTIVATION_BLOCKED_MESSAGE, blockedErrorCode(access.reason), {
    access_mode: 'BLOCKED',
  });
}
