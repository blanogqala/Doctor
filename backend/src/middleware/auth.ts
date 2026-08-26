import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../config/database';
import {
  getPlatformSessionRawToken,
  getPracticeSessionRawToken,
} from '../utils/cookies';
import {
  resolvePlatformSession,
  resolvePracticeSession,
  verifyCsrfToken,
} from '../services/sessionService';

export interface JwtPayload {
  userId: string;
  role: UserRole;
  practiceId: string;
}

export interface SuperAdminJwtPayload {
  superAdminId: string;
  isSuperAdmin: true;
  email: string;
}

export interface PracticeSessionContext {
  id: string;
  csrfTokenHash: string;
}

export interface PlatformSessionContext {
  id: string;
  csrfTokenHash: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      superAdmin?: SuperAdminJwtPayload;
      isSuperAdmin?: boolean;
      practiceSession?: PracticeSessionContext;
      platformSession?: PlatformSessionContext;
      csrfToken?: string;
    }
  }
}

/**
 * Optionally attach practice/platform session context from cookies.
 * Must run before csrfProtect so mutating requests can validate X-CSRF-Token.
 */
export async function attachOptionalSessions(req: Request, _res: Response, next: NextFunction) {
  try {
    const practiceRaw = getPracticeSessionRawToken(req);
    if (practiceRaw) {
      const resolved = await resolvePracticeSession(practiceRaw);
      if (resolved) {
        req.practiceSession = {
          id: resolved.session.id,
          csrfTokenHash: resolved.session.csrfTokenHash,
        };
        req.user = {
          userId: resolved.profile.id,
          role: resolved.profile.role,
          practiceId: resolved.profile.practiceId,
        };
      }
    }

    const platformRaw = getPlatformSessionRawToken(req);
    if (platformRaw) {
      const resolved = await resolvePlatformSession(platformRaw);
      if (resolved) {
        req.platformSession = {
          id: resolved.session.id,
          csrfTokenHash: resolved.session.csrfTokenHash,
        };
        req.superAdmin = {
          superAdminId: resolved.admin.id,
          isSuperAdmin: true,
          email: resolved.admin.email,
        };
        req.isSuperAdmin = true;
      }
    }
  } catch {
    // ignore invalid cookies; route-level auth will reject as needed
  }
  next();
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  // Platform sessions must never authenticate practice/clinic routes.
  if (getPlatformSessionRawToken(req) && !getPracticeSessionRawToken(req)) {
    return res.status(403).json({ error: 'Platform session cannot access practice routes' });
  }

  const rawToken = getPracticeSessionRawToken(req);
  if (!rawToken) {
    return res.status(401).json({ error: 'No session provided' });
  }

  try {
    // Reuse attachOptionalSessions result when present and still matches cookie.
    if (req.practiceSession && req.user) {
      if (req.practiceContext && req.user.practiceId !== req.practiceContext.id) {
        return res.status(403).json({ error: 'Token practice mismatch', code: 'PRACTICE_MISMATCH' });
      }
      return next();
    }

    const resolved = await resolvePracticeSession(rawToken);
    if (!resolved) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    if (req.practiceContext && resolved.profile.practiceId !== req.practiceContext.id) {
      return res.status(403).json({ error: 'Token practice mismatch', code: 'PRACTICE_MISMATCH' });
    }

    req.practiceSession = {
      id: resolved.session.id,
      csrfTokenHash: resolved.session.csrfTokenHash,
    };
    req.user = {
      userId: resolved.profile.id,
      role: resolved.profile.role,
      practiceId: resolved.profile.practiceId,
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid session' });
  }
}

export function authorize(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const rawToken = getPracticeSessionRawToken(req);
  if (!rawToken) {
    next();
    return;
  }
  try {
    const resolved = await resolvePracticeSession(rawToken);
    if (resolved) {
      req.practiceSession = {
        id: resolved.session.id,
        csrfTokenHash: resolved.session.csrfTokenHash,
      };
      req.user = {
        userId: resolved.profile.id,
        role: resolved.profile.role,
        practiceId: resolved.profile.practiceId,
      };
    }
  } catch {
    // ignore invalid session
  }
  next();
}

export async function authenticateSuperAdmin(req: Request, res: Response, next: NextFunction) {
  // Practice sessions must never authenticate platform routes.
  if (getPracticeSessionRawToken(req) && !getPlatformSessionRawToken(req)) {
    return res.status(403).json({ error: 'Practice session cannot access platform routes' });
  }

  const rawToken = getPlatformSessionRawToken(req);
  if (!rawToken) {
    return res.status(401).json({ error: 'No session provided' });
  }

  try {
    if (req.platformSession && req.superAdmin?.isSuperAdmin) {
      return next();
    }

    const resolved = await resolvePlatformSession(rawToken);
    if (!resolved) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    req.platformSession = {
      id: resolved.session.id,
      csrfTokenHash: resolved.session.csrfTokenHash,
    };
    req.superAdmin = {
      superAdminId: resolved.admin.id,
      isSuperAdmin: true,
      email: resolved.admin.email,
    };
    req.isSuperAdmin = true;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid session' });
  }
}

export function authorizeSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.superAdmin?.isSuperAdmin) {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  next();
}

/**
 * Restrict Super Admin mutating/browser traffic to the configured platform frontend origin.
 * Tenant origins must not call /api/super-admin/*.
 */
export function requirePlatformOrigin(req: Request, res: Response, next: NextFunction) {
  const origin = req.get('origin');
  if (!origin) {
    // Non-browser clients (tests/tools) may omit Origin; allow only outside production.
    if (env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Platform origin required' });
    }
    return next();
  }

  const allowed = new Set<string>();
  if (env.PLATFORM_FRONTEND_URL) allowed.add(env.PLATFORM_FRONTEND_URL);
  allowed.add(env.FRONTEND_URL);
  if (env.NODE_ENV !== 'production') {
    // Local platform host during development.
    allowed.add('http://localhost:3000');
    allowed.add('http://127.0.0.1:3000');
  }
  if (env.CORS_ALLOWED_ORIGINS) {
    for (const extra of env.CORS_ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)) {
      allowed.add(extra);
    }
  }

  if (!allowed.has(origin)) {
    return res.status(403).json({ error: 'Platform origin rejected' });
  }
  return next();
}

export async function requirePracticeOwner(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const practiceId = req.practiceContext?.id ?? req.user.practiceId;
  const practice = await prisma.practice.findFirst({
    where: { id: practiceId, softDeletedAt: null },
    select: { id: true, ownerProfileId: true, subscriptionStatus: true },
  });

  if (!practice || practice.id !== req.user.practiceId) {
    return res.status(403).json({ error: 'Practice owner access required' });
  }
  if (practice.ownerProfileId !== req.user.userId) {
    return res.status(403).json({ error: 'Practice owner access required' });
  }
  if (practice.subscriptionStatus === 'CANCELLED' && !isOwnerBillingPath(req)) {
    return res.status(403).json({ error: 'This Practice is cancelled', code: 'PRACTICE_CANCELLED' });
  }

  next();
}

function isOwnerBillingPath(req: Request): boolean {
  if (req.method === 'GET' && req.path === '/') return true;
  if (req.method === 'GET' && req.path === '/eft-instructions') return true;
  if (req.method === 'POST' && /\/invoices\/[^/]+\/report-payment$/.test(req.path)) return true;
  return false;
}

export { verifyCsrfToken };
