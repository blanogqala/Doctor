import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { verifyCsrfToken } from '../services/sessionService';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isAllowedBrowserOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  if (origin === env.FRONTEND_URL) return true;
  if (env.PLATFORM_FRONTEND_URL && origin === env.PLATFORM_FRONTEND_URL) return true;
  if (env.NODE_ENV !== 'production') {
    if (/^https?:\/\/([a-z0-9-]+\.)*localhost(:\d+)?$/i.test(origin)) return true;
    if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/i.test(origin)) return true;
  }
  if (env.CORS_ALLOWED_ORIGINS) {
    const extras = env.CORS_ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
    if (extras.includes(origin)) return true;
  }
  return false;
}

function originFromReferer(referer: string | undefined): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

/**
 * CSRF protection for cookie-authenticated browser mutations.
 * Requires X-CSRF-Token matching the active session csrf hash.
 * Also validates Origin/Referer when present.
 *
 * Unauthenticated routes (login/register/password reset/invite accept) are skipped
 * because they have no session yet.
 */
export function csrfProtect(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    return next();
  }

  if (!req.practiceSession && !req.platformSession) {
    return next();
  }

  const origin = req.get('origin') || originFromReferer(req.get('referer') || undefined);
  if (origin && !isAllowedBrowserOrigin(origin)) {
    return res.status(403).json({ error: 'CSRF origin rejected' });
  }

  if (env.NODE_ENV === 'production' && !origin) {
    return res.status(403).json({ error: 'CSRF origin required' });
  }

  const provided =
    req.get('x-csrf-token') ||
    (typeof req.body?.csrf_token === 'string' ? req.body.csrf_token : undefined);

  const expectedHash = req.practiceSession?.csrfTokenHash || req.platformSession?.csrfTokenHash;
  if (!expectedHash || !verifyCsrfToken(expectedHash, provided)) {
    return res.status(403).json({ error: provided ? 'Invalid CSRF token' : 'CSRF token required' });
  }

  return next();
}
