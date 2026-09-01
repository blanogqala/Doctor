import { env } from '../config/env';

export type TenantRoutingMode = 'canonical' | 'subdomain';

export type FrontendUrlOptions = {
  frontendUrl?: string;
  platformFrontendUrl?: string;
  tenantRoutingMode?: TenantRoutingMode;
  appBaseDomain?: string | null;
};

function frontendBase(options?: FrontendUrlOptions): string {
  return (options?.frontendUrl ?? env.FRONTEND_URL).replace(/\/$/, '');
}

function platformBase(options?: FrontendUrlOptions): string {
  const platform = options?.platformFrontendUrl ?? env.PLATFORM_FRONTEND_URL;
  return (platform || frontendBase(options)).replace(/\/$/, '');
}

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

function routingMode(options?: FrontendUrlOptions): TenantRoutingMode {
  return options?.tenantRoutingMode ?? env.TENANT_ROUTING_MODE;
}

function configuredAppBaseDomain(options?: FrontendUrlOptions): string {
  const raw = options?.appBaseDomain ?? env.APP_BASE_DOMAIN ?? '';
  return raw.trim().toLowerCase().replace(/^\.+/, '').replace(/^www\./, '');
}

/** Canonical platform origin + path. Does not put a practice slug into the hostname. */
export function canonicalFrontendUrl(path: string, options?: FrontendUrlOptions): string {
  return `${platformBase(options)}${normalizePath(path)}`;
}

/** Build a Practice-tenant frontend URL (subdomain host). No secrets/tokens. */
export function practiceFrontendUrl(
  subdomain: string,
  path: string,
  options?: FrontendUrlOptions
): string {
  const base = frontendBase(options);
  const normalizedPath = normalizePath(path);
  if (base.includes('localhost:3000')) {
    return `${base.replace('localhost:3000', `${subdomain}.localhost:3000`)}${normalizedPath}`;
  }
  try {
    const url = new URL(base);
    const host = configuredAppBaseDomain(options) || url.hostname.replace(/^www\./, '');
    url.hostname = `${subdomain}.${host}`;
    return `${url.origin}${normalizedPath}`;
  } catch {
    return `${base}${normalizedPath}`;
  }
}

/**
 * Token-based account activation / credential emails.
 * Canonical mode uses the platform frontend; subdomain mode uses practice hosts.
 */
export function accountActivationUrl(
  subdomain: string,
  path: string,
  options?: FrontendUrlOptions
): string {
  if (routingMode(options) === 'subdomain') {
    return practiceFrontendUrl(subdomain, path, options);
  }
  return canonicalFrontendUrl(path, options);
}
