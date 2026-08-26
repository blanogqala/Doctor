/**
 * Frontend mirror of backend host→tenant resolution.
 * Platform / staging apex hosts must be configured via NEXT_PUBLIC_* env.
 */

export type HostTenantOptions = {
  platformHostnames?: string | string[] | null;
  appBaseDomain?: string | null;
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

/** Options from Next public env (middleware + browser). */
export function hostTenantOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): HostTenantOptions {
  return {
    platformHostnames: env.NEXT_PUBLIC_PLATFORM_HOSTNAME || null,
    appBaseDomain: env.NEXT_PUBLIC_APP_BASE_DOMAIN || null,
  };
}
