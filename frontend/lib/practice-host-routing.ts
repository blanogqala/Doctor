import {
  hostTenantOptionsFromEnv,
  resolveTenantSubdomainFromHostname,
  type HostTenantOptions,
} from './hostTenant';
import { isMarketingOnlyPath } from './marketing/routes';

export type PracticeHostRouteDecision = {
  tenant: string | null;
  redirectPath: string | null;
};

function normalizePath(pathname: string): string {
  return pathname.replace(/\/$/, '') || '/';
}

export function isSuperAdminPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return path === '/super-admin' || path.startsWith('/super-admin/');
}

/**
 * Practice-hostname routing only. Apex `?tenant=` is ignored so
 * medinathi.co.za/ stays the public platform site.
 */
export function decidePracticeHostRoute(input: {
  host: string;
  pathname: string;
  options?: HostTenantOptions;
}): PracticeHostRouteDecision {
  const options = input.options ?? hostTenantOptionsFromEnv();
  const tenant = resolveTenantSubdomainFromHostname(input.host, options);
  if (!tenant) {
    return { tenant: null, redirectPath: null };
  }

  const path = normalizePath(input.pathname);
  if (isSuperAdminPath(path)) {
    return { tenant, redirectPath: '/login' };
  }
  if (isMarketingOnlyPath(path)) {
    return { tenant, redirectPath: '/' };
  }

  return { tenant, redirectPath: null };
}
