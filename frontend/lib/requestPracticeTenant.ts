import {
  hostTenantOptionsFromEnv,
  resolveTenantSubdomainFromHostname,
  type HostTenantOptions,
} from './hostTenant';

/** Forwarded by middleware so SSR and hydration share the same hostname tenant. */
export const PRACTICE_TENANT_HEADER = 'x-practice-tenant';

export function parsePracticeTenantHeader(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 63) || null;
}

export function hostFromRequestHeaders(headers: {
  get(name: string): string | null;
}): string {
  const forwarded = headers.get('x-forwarded-host');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headers.get('host') || '';
}

/**
 * Hostname-only tenant for the first React render.
 * Server and client must both use this (from the request Host), never `window`.
 */
export function initialPracticeTenantFromHost(
  host: string,
  options?: HostTenantOptions
): string | null {
  return resolveTenantSubdomainFromHostname(
    host,
    options ?? hostTenantOptionsFromEnv()
  );
}

export function resolvePracticeTenantForRequest(input: {
  host: string;
  headerValue?: string | null;
  options?: HostTenantOptions;
}): string | null {
  const fromHeader = parsePracticeTenantHeader(input.headerValue);
  if (fromHeader) return fromHeader;
  return initialPracticeTenantFromHost(input.host, input.options);
}

/** First-paint login chrome — identical on server and client for a given tenant. */
export function loginFirstRenderState(initialSubdomain: string | null, showBackLink = true) {
  return {
    tenant: initialSubdomain,
    showLandingBack: showBackLink,
  };
}
