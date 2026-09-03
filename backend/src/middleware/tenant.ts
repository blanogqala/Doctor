import { Request, Response, NextFunction } from 'express';
import {
  SubscriptionStatus,
  SubscriptionSuspensionReason,
} from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { DEFAULT_RESERVED, resolveTenantSubdomainFromHostname } from '../utils/hostTenant';
import {
  blockedErrorCode,
  blockedErrorMessage,
  derivePracticeAccess,
  isBillingRecoveryOrSecurityPath,
  isPracticeAccessEnforcementSkip,
  isReadOnlyAllowedMutation,
  isSafeHttpMethod,
  readOnlyErrorMessage,
  requestPathname,
  type PracticeAccessState,
} from '../services/practiceAccessPolicy';

export const RESERVED_SUBDOMAINS: ReadonlySet<string> = DEFAULT_RESERVED;

export interface PracticeContext {
  id: string;
  subdomain: string;
  clinicName: string;
  logoUrl: string | null;
  brandColor: string;
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: Date | null;
  subscriptionEndsAt: Date | null;
  monthlyFeeCents: number;
  ownerProfileId: string | null;
  subscriptionSuspensionReason: SubscriptionSuspensionReason | null;
  subscriptionSuspendedAt: Date | null;
  access: PracticeAccessState;
}

declare global {
  namespace Express {
    interface Request {
      practiceContext?: PracticeContext;
      isSuperAdmin?: boolean;
    }
  }
}

export function normalizeSubdomain(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 63);
}

export function isReservedSubdomain(subdomain: string): boolean {
  return RESERVED_SUBDOMAINS.has(subdomain);
}

/** Extract tenant subdomain from Host, X-Tenant-Subdomain header, or cookie. */
export function extractSubdomain(req: Request): string | null {
  const header = req.headers['x-tenant-subdomain'];
  if (typeof header === 'string' && header.trim()) {
    return normalizeSubdomain(header.trim());
  }

  const cookieHeader = req.headers.cookie ?? '';
  const cookieMatch = cookieHeader.match(/(?:^|;\s*)practice_subdomain=([^;]+)/);
  if (cookieMatch?.[1]) {
    return normalizeSubdomain(decodeURIComponent(cookieMatch[1]));
  }

  const host = (req.headers.host || '').split(':')[0].toLowerCase();
  const fromHost = resolveTenantSubdomainFromHostname(host, {
    platformHostnames: env.PLATFORM_HOSTNAME,
    appBaseDomain: env.APP_BASE_DOMAIN,
    reserved: RESERVED_SUBDOMAINS,
  });
  return fromHost ? normalizeSubdomain(fromHost) : null;
}

export async function detectTenant(req: Request, res: Response, next: NextFunction) {
  try {
    if (
      req.path === '/health' ||
      req.path.startsWith('/health/') ||
      req.path.startsWith('/api/super-admin') ||
      req.path.startsWith('/api/invitations')
    ) {
      return next();
    }

    const subdomain = extractSubdomain(req);
    if (!subdomain) {
      return next();
    }

    if (isReservedSubdomain(subdomain)) {
      return next();
    }

    const practice = await prisma.practice.findFirst({
      where: { subdomain, softDeletedAt: null },
    });

    if (!practice) {
      return res.status(404).json({ error: 'Practice not found', code: 'PRACTICE_NOT_FOUND' });
    }

    const access = derivePracticeAccess(practice);

    req.practiceContext = {
      id: practice.id,
      subdomain: practice.subdomain,
      clinicName: practice.clinicName,
      logoUrl: practice.logoUrl,
      brandColor: practice.brandColor,
      subscriptionStatus: practice.subscriptionStatus,
      trialEndsAt: practice.trialEndsAt,
      subscriptionEndsAt: practice.subscriptionEndsAt,
      monthlyFeeCents: practice.monthlyFeeCents,
      ownerProfileId: practice.ownerProfileId,
      subscriptionSuspensionReason: practice.subscriptionSuspensionReason,
      subscriptionSuspendedAt: practice.subscriptionSuspendedAt,
      access,
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Central Practice access enforcement. Must run after sessions + CSRF.
 * detectTenant only resolves context; this middleware is the gate.
 */
export function enforcePracticeAccess(req: Request, res: Response, next: NextFunction) {
  if (isPracticeAccessEnforcementSkip(req)) {
    return next();
  }

  const practice = req.practiceContext;
  if (!practice) {
    return next();
  }

  const { mode, reason } = practice.access;
  if (mode === 'FULL') {
    return next();
  }

  const method = req.method;
  const pathname = requestPathname(req);

  if (mode === 'READ_ONLY') {
    if (isSafeHttpMethod(method) || isReadOnlyAllowedMutation(method, pathname)) {
      return next();
    }
    const role = req.user?.role;
    return res.status(403).json({
      error: readOnlyErrorMessage(role),
      code: 'PRACTICE_READ_ONLY',
      access_mode: 'READ_ONLY',
    });
  }

  // BLOCKED: security/recovery only. No clinical GETs.
  if (isBillingRecoveryOrSecurityPath(method, pathname)) {
    return next();
  }

  return res.status(403).json({
    error: blockedErrorMessage(reason),
    code: blockedErrorCode(reason),
    access_mode: 'BLOCKED',
  });
}

export function requireTenant(req: Request, res: Response, next: NextFunction) {
  if (!req.practiceContext) {
    return res.status(400).json({
      error: 'Tenant context required. Access via practice subdomain or X-Tenant-Subdomain header.',
      code: 'TENANT_REQUIRED',
    });
  }
  next();
}

export function tenantWhere(req: Request): { practiceId: string } {
  if (!req.practiceContext) {
    throw new Error('Practice context missing');
  }
  return { practiceId: req.practiceContext.id };
}

export function requirePracticeMatch(req: Request, practiceId: string | null | undefined) {
  if (!req.practiceContext || !practiceId || practiceId !== req.practiceContext.id) {
    return false;
  }
  return true;
}
