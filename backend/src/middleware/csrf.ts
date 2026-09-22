import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { verifyCsrfToken } from '../services/sessionService';
import { isAllowedBrowserOrigin, originFromReferer } from '../utils/browserOrigin';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Token-authenticated public mutations. Auth is the hashed single-use token,
 * not the practice session. Leftover MediNathi_practice_sid cookies (host-only
 * on api.medinathi.co.za) must not require CSRF here — there is no anonymous
 * CSRF bootstrap, and invite/activation/reset pages do not hold the leftover
 * session's CSRF secret.
 */
export const PUBLIC_TOKEN_CSRF_EXEMPT_POSTS = [
  '/api/invitations/accept',
  '/api/activations/accept',
  '/api/auth/reset-password',
] as const;

/**
 * Session-establishing POSTs. Same leftover-cookie problem as public token
 * routes: login/register have not issued a CSRF secret yet, but a stale
 * MediNathi_practice_sid / MediNathi_platform_sid cookie still attaches a
 * session and would otherwise 403 with "CSRF token required".
 */
export const SESSION_BOOTSTRAP_CSRF_EXEMPT_POSTS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/super-admin/login',
] as const;

export function requestPathname(req: Pick<Request, 'path' | 'originalUrl'>): string {
  const raw = String(req.originalUrl || req.path || '').split('?')[0];
  return raw.replace(/\/$/, '') || '/';
}

export function isPublicTokenCsrfExempt(method: string, pathname: string): boolean {
  if (method.toUpperCase() !== 'POST') return false;
  const path = pathname.replace(/\/$/, '') || '/';
  return (PUBLIC_TOKEN_CSRF_EXEMPT_POSTS as readonly string[]).includes(path);
}

export function isSessionBootstrapCsrfExempt(method: string, pathname: string): boolean {
  if (method.toUpperCase() !== 'POST') return false;
  const path = pathname.replace(/\/$/, '') || '/';
  return (SESSION_BOOTSTRAP_CSRF_EXEMPT_POSTS as readonly string[]).includes(path);
}

export function isCsrfExemptPost(method: string, pathname: string): boolean {
  return isPublicTokenCsrfExempt(method, pathname) || isSessionBootstrapCsrfExempt(method, pathname);
}

export { isAllowedBrowserOrigin };

/**
 * CSRF protection for cookie-authenticated browser mutations.
 * Requires X-CSRF-Token matching the active session csrf hash.
 * Also validates Origin/Referer when present.
 *
 * Unauthenticated routes (login/register/password reset/invite accept) are skipped
 * because they have no session yet. Public token POSTs and session-bootstrap
 * POSTs stay exempt even if a leftover session cookie is present.
 */
export function csrfProtect(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    return next();
  }

  if (isCsrfExemptPost(req.method, requestPathname(req))) {
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
