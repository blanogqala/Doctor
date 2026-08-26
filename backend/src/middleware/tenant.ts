import { Request, Response, NextFunction } from 'express';
import { SubscriptionStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { resolveTenantSubdomainFromHostname } from '../utils/hostTenant';

export const RESERVED_SUBDOMAINS = new Set([
  'www',
  'admin',
  'app',
  'api',
  'super-admin',
  'mail',
  'static',
  'localhost',
]);

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

export function isSubscriptionGateExempt(req: Request): boolean {
  const path = req.path;
  if (path.startsWith('/api/public') || path.startsWith('/api/invitations') || path.startsWith('/api/activations')) {
    return true;
  }
  if (path === '/api/auth/login' || path === '/api/auth/forgot-password' || path === '/api/auth/reset-password') {
    return true;
  }
  if (path === '/api/auth/me' || path === '/api/auth/logout') return true;
  if (req.method === 'GET' && path === '/api/practice-management') return true;
  if (req.method === 'GET' && path === '/api/practice-management/eft-instructions') return true;
  if (req.method === 'POST' && /^\/api\/practice-management\/invoices\/[^/]+\/report-payment$/.test(path)) {
    return true;
  }
  return false;
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

    if (!isSubscriptionGateExempt(req)) {
      if (
        practice.subscriptionStatus === SubscriptionStatus.SUSPENDED ||
        practice.subscriptionStatus === SubscriptionStatus.CANCELLED
      ) {
        return res.status(403).json({
          error: 'Subscription expired. Please contact support.',
          code: 'SUBSCRIPTION_EXPIRED',
        });
      }

      if (
        practice.subscriptionStatus === SubscriptionStatus.TRIAL &&
        practice.trialEndsAt &&
        practice.trialEndsAt < new Date()
      ) {
        return res.status(403).json({
          error: 'Trial expired. Please subscribe to continue.',
          code: 'TRIAL_EXPIRED',
        });
      }
    }

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
    };

    next();
  } catch (error) {
    next(error);
  }
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
