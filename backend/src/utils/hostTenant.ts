/**
 * Resolve Practice tenant subdomain from a hostname only.
 * Does not read cookies or X-Tenant-Subdomain (callers handle those separately).
 *
 * Platform / staging apex hosts must be configured via env so Netlify/Render
 * temporary domains are never misread as Practice tenants.
 */
export type HostTenantOptions = {
  /** Exact platform hosts (comma-separated or array). No tenant. */
  platformHostnames?: string | string[] | null;
  /** When set, only `*.{base}` yields a tenant; base itself is platform. */
  appBaseDomain?: string | null;
  /** Subdomains that must never be treated as practices. */
  reserved?: ReadonlySet<string> | readonly string[];
};

const DEFAULT_RESERVED = new Set([
  'www',
  'admin',
  'app',
  'api',
  'super-admin',
  'mail',
  'static',
  'localhost',
]);

export function normalizeHostname(host: string): string {
  return host.split(':')[0].trim().toLowerCase();
}

function parseHostnameList(value: string | string[] | null | undefined): string[] {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : value.split(',');
  return raw.map((h) => normalizeHostname(h)).filter(Boolean);
}

function reservedSet(reserved?: HostTenantOptions['reserved']): Set<string> {
  if (!reserved) return DEFAULT_RESERVED;
  if (reserved instanceof Set) return reserved;
  return new Set([...DEFAULT_RESERVED, ...reserved]);
}

/**
 * @returns Practice subdomain or null when host is platform / unrecognized.
 */
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

  // eastern-cape.localhost → eastern-cape
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
      // Only a single tenant label under the base (no nested multi-level hijack).
      if (!sub || sub.includes('.')) return null;
      if (reserved.has(sub)) return null;
      return sub.replace(/[^a-z0-9-]/g, '').slice(0, 63) || null;
    }
  }

  // No APP_BASE_DOMAIN match and not *.localhost → do not invent a tenant
  // (avoids medspace-staging.netlify.app / *.onrender.com false positives).
  return null;
}
