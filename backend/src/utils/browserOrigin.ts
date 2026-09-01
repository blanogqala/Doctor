import { env } from '../config/env';
import { resolveTenantSubdomainFromHostname } from './hostTenant';

export type BrowserOriginAllowOptions = {
  frontendUrl?: string;
  platformFrontendUrl?: string;
  corsAllowedOrigins?: string;
  nodeEnv?: string;
  appBaseDomain?: string | null;
  platformHostnames?: string | null;
};

function resolved(options?: BrowserOriginAllowOptions) {
  return {
    frontendUrl: options?.frontendUrl ?? env.FRONTEND_URL,
    platformFrontendUrl: options?.platformFrontendUrl ?? env.PLATFORM_FRONTEND_URL,
    corsAllowedOrigins: options?.corsAllowedOrigins ?? env.CORS_ALLOWED_ORIGINS,
    nodeEnv: options?.nodeEnv ?? env.NODE_ENV,
    appBaseDomain: options?.appBaseDomain ?? env.APP_BASE_DOMAIN ?? null,
    platformHostnames: options?.platformHostnames ?? env.PLATFORM_HOSTNAME ?? null,
  };
}

export function originFromReferer(referer: string | undefined): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

/** Origin header, or Referer origin when Origin is absent (CSRF / invite host checks). */
export function browserOriginFromHeaders(headers: {
  origin?: string;
  referer?: string;
}): string | undefined {
  return headers.origin || originFromReferer(headers.referer);
}

function extraAllowedOrigins(csv: string | undefined): string[] {
  if (!csv) return [];
  return csv.split(',').map((s) => s.trim()).filter(Boolean);
}

function isExactConfiguredOrigin(origin: string, options?: BrowserOriginAllowOptions): boolean {
  const cfg = resolved(options);
  if (origin === cfg.frontendUrl) return true;
  if (cfg.platformFrontendUrl && origin === cfg.platformFrontendUrl) return true;
  return extraAllowedOrigins(cfg.corsAllowedOrigins).includes(origin);
}

function isNonProductionLocalOrigin(origin: string, nodeEnv: string): boolean {
  if (nodeEnv === 'production') return false;
  if (/^https?:\/\/([a-z0-9-]+\.)*localhost(:\d+)?$/i.test(origin)) return true;
  if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/i.test(origin)) return true;
  return false;
}

/**
 * Tenant origin from APP_BASE_DOMAIN: https (production) + one label + slug rules + not reserved.
 * Does not query the database.
 */
export function tenantSubdomainFromOrigin(
  origin: string,
  options?: BrowserOriginAllowOptions
): string | null {
  const cfg = resolved(options);
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  if (cfg.nodeEnv === 'production' && url.protocol !== 'https:') {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }
  return resolveTenantSubdomainFromHostname(url.hostname, {
    platformHostnames: cfg.platformHostnames,
    appBaseDomain: cfg.appBaseDomain,
  });
}

/**
 * CSRF / browser Origin allowlist. Missing origin is never allowed here.
 * CORS callers should treat missing origin as allowed separately.
 */
export function isAllowedBrowserOrigin(
  origin: string | undefined,
  options?: BrowserOriginAllowOptions
): boolean {
  if (!origin) return false;
  if (isExactConfiguredOrigin(origin, options)) return true;
  const cfg = resolved(options);
  if (isNonProductionLocalOrigin(origin, cfg.nodeEnv)) return true;
  return tenantSubdomainFromOrigin(origin, options) !== null;
}

/** CORS origin callback: missing Origin is allowed (non-browser clients). */
export function isCorsAllowedOrigin(
  origin: string | undefined,
  options?: BrowserOriginAllowOptions
): boolean {
  if (!origin) return true;
  return isAllowedBrowserOrigin(origin, options);
}

/**
 * After a token is validated, a *different* valid practice Origin must not proceed.
 * Missing Origin or platform Origin is not treated as authorization (token remains authoritative).
 */
export function isInvitationOriginMismatch(
  origin: string | undefined,
  practiceSubdomain: string,
  options?: BrowserOriginAllowOptions
): boolean {
  if (!origin) return false;
  const fromOrigin = tenantSubdomainFromOrigin(origin, options);
  if (!fromOrigin) return false;
  return fromOrigin !== practiceSubdomain.trim().toLowerCase();
}
