import { Request, Response } from 'express';
import { env } from '../config/env';

export const PRACTICE_SESSION_COOKIE = 'MediNathi_practice_sid';
export const PLATFORM_SESSION_COOKIE = 'MediNathi_platform_sid';

const PRACTICE_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PLATFORM_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

function cookieSecure(): boolean {
  if (process.env.COOKIE_SECURE === 'true') return true;
  if (process.env.COOKIE_SECURE === 'false') return false;
  return env.NODE_ENV === 'production';
}

function cookieSameSite(): 'Lax' | 'None' | 'Strict' {
  const configured = (process.env.COOKIE_SAMESITE || '').toLowerCase();
  if (configured === 'none' || configured === 'lax' || configured === 'strict') {
    return (configured.charAt(0).toUpperCase() + configured.slice(1)) as 'Lax' | 'None' | 'Strict';
  }
  // Cross-site Netlify → Render requires None in production HTTPS.
  return cookieSecure() ? 'None' : 'Lax';
}

function serializeCookie(
  name: string,
  value: string,
  options: {
    maxAgeMs: number;
    httpOnly: boolean;
    path?: string;
  }
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path ?? '/'}`,
    `Max-Age=${Math.floor(options.maxAgeMs / 1000)}`,
    `SameSite=${cookieSameSite()}`,
  ];
  if (options.httpOnly) parts.push('HttpOnly');
  if (cookieSecure()) parts.push('Secure');
  return parts.join('; ');
}

function clearCookieHeader(name: string): string {
  const parts = [
    `${name}=`,
    'Path=/',
    'Max-Age=0',
    `SameSite=${cookieSameSite()}`,
    'HttpOnly',
  ];
  if (cookieSecure()) parts.push('Secure');
  return parts.join('; ');
}

export function appendSetCookie(res: Response, cookie: string) {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) {
    res.setHeader('Set-Cookie', cookie);
    return;
  }
  if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookie]);
    return;
  }
  res.setHeader('Set-Cookie', [String(existing), cookie]);
}

export function setPracticeSessionCookie(res: Response, rawToken: string) {
  appendSetCookie(
    res,
    serializeCookie(PRACTICE_SESSION_COOKIE, rawToken, {
      maxAgeMs: PRACTICE_SESSION_TTL_MS,
      httpOnly: true,
    })
  );
}

export function setPlatformSessionCookie(res: Response, rawToken: string) {
  appendSetCookie(
    res,
    serializeCookie(PLATFORM_SESSION_COOKIE, rawToken, {
      maxAgeMs: PLATFORM_SESSION_TTL_MS,
      httpOnly: true,
    })
  );
}

export function clearPracticeSessionCookie(res: Response) {
  appendSetCookie(res, clearCookieHeader(PRACTICE_SESSION_COOKIE));
}

export function clearPlatformSessionCookie(res: Response) {
  appendSetCookie(res, clearCookieHeader(PLATFORM_SESSION_COOKIE));
}

export function getPracticeSessionRawToken(req: Request): string | null {
  return parseCookies(req)[PRACTICE_SESSION_COOKIE] || null;
}

export function getPlatformSessionRawToken(req: Request): string | null {
  return parseCookies(req)[PLATFORM_SESSION_COOKIE] || null;
}

export { PRACTICE_SESSION_TTL_MS, PLATFORM_SESSION_TTL_MS };
