import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { verifyCsrfToken } from '../services/sessionService';
import { isAllowedBrowserOrigin, originFromReferer } from '../utils/browserOrigin';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export { isAllowedBrowserOrigin };

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
