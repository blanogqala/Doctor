/**
 * Frontend mirror of backend host→tenant resolution.
 * Platform / staging apex hosts must be configured via NEXT_PUBLIC_* env.
 * Reserved labels must stay aligned with backend/src/utils/hostTenant.ts.
 */

export type HostTenantOptions = {
  platformHostnames?: string | string[] | null;
  appBaseDomain?: string | null;
  reserved?: ReadonlySet<string> | readonly string[];
};

export const DEFAULT_RESERVED_HOST_LABELS = [
  'www',
  'admin',
  'app',
  'api',
  'super-admin',
  'mail',
  'static',
  'localhost',
] as const;

const DEFAULT_RESERVED = new Set<string>(DEFAULT_RESERVED_HOST_LABELS);

export function normalizeHostname(host: string): string {
  return host.split(':')[0].trim().toLowerCase();
}

function parseHostnameList(value: string | string[] | null | undefined): string[] {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : value.split(',');
  return raw.map((h) => normalizeHostname(h)).filter(Boolean);
}

function reservedSet(reserved?: HostTenantOptions['reserved']): ReadonlySet<string> {
  if (!reserved) return DEFAULT_RESERVED;
  if (reserved instanceof Set) return reserved;
  return new Set([...DEFAULT_RESERVED, ...reserved]);
}

export function resolveTenantSubdomainFromHostname(
  hostRaw: string,
  options: HostTenantOptions = {}
): string | null {
  const host = normalizeHostname(hostRaw);
  if (!host) return null;

  const reserved = reservedSet(options.reserved);

  if (host === 'localhost' || host === '127.0.0.1') {
    return null;
  }

  if (host.endsWith('.localhost')) {
    const sub = host.slice(0, -'.localhost'.length);
    if (!sub || reserved.has(sub)) return null;
    return sub.replace(/[^a-z0-9-]/g, '').slice(0, 63) || null;
  }

  const platformHosts = new Set(parseHostnameList(options.platformHostnames));
  if (platformHosts.has(host)) {
    return null;
  }

  const base = (options.appBaseDomain || '').trim().toLowerCase().replace(/^\.+/, '');
  if (base) {
    if (host === base) return null;
    const suffix = `.${base}`;
    if (host.endsWith(suffix)) {
      const sub = host.slice(0, -suffix.length);
      if (!sub || sub.includes('.')) return null;
      if (reserved.has(sub)) return null;
      return sub.replace(/[^a-z0-9-]/g, '').slice(0, 63) || null;
    }
  }

  return null;
}

export function tenantFromQuery(search: string): string | null {
  const query = search.startsWith('?') ? search.slice(1) : search;
  const raw = new URLSearchParams(query).get('tenant');
  if (!raw) return null;
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 63) || null;
}

/** UI tenant: practice hostname wins; otherwise explicit ?tenant= on platform/apex hosts. */
export function resolveUiTenantSubdomain(
  hostname: string,
  search: string,
  options: HostTenantOptions = {}
): string | null {
  const fromHost = resolveTenantSubdomainFromHostname(hostname, options);
  if (fromHost) return fromHost;
  return tenantFromQuery(search);
}

/**
 * API X-Tenant-Subdomain: practice hostname wins; then ?tenant= on platform hosts;
 * cookie/localStorage only as apex fallbacks (ignored on bare localhost).
 */
export function resolveApiTenantSubdomain(input: {
  hostname: string;
  search: string;
  cookieValue?: string | null;
  localStorageValue?: string | null;
  options?: HostTenantOptions;
}): string | null {
  const hostname = input.hostname.toLowerCase();
  const fromHost = resolveTenantSubdomainFromHostname(hostname, input.options);
  if (fromHost) return fromHost;

  const fromQuery = tenantFromQuery(input.search);
  if (fromQuery) return fromQuery;

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return null;
  }

  const cookie = input.cookieValue?.trim();
  if (cookie) return cookie.toLowerCase();
  const stored = input.localStorageValue?.trim();
  if (stored) return stored.toLowerCase();
  return null;
}

/** Options from Next public env (middleware + browser). */
export function hostTenantOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): HostTenantOptions {
  return {
    platformHostnames: env.NEXT_PUBLIC_PLATFORM_HOSTNAME || null,
    appBaseDomain: env.NEXT_PUBLIC_APP_BASE_DOMAIN || null,
  };
}
