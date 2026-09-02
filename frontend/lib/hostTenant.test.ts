import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RESERVED_HOST_LABELS,
  hostTenantOptionsFromEnv,
  resolveApiTenantSubdomain,
  resolveTenantSubdomainFromHostname,
  resolveUiTenantSubdomain,
} from './hostTenant';

describe('resolveTenantSubdomainFromHostname (frontend)', () => {
  const stagingOpts = {
    platformHostnames: 'MediNathi-staging.netlify.app,MediNathi-api.onrender.com',
    appBaseDomain: 'MediNathi-staging.netlify.app',
  };

  it('does not treat Netlify staging host as tenant', () => {
    expect(
      resolveTenantSubdomainFromHostname('MediNathi-staging.netlify.app', stagingOpts)
    ).toBeNull();
  });

  it('does not treat Render host as tenant', () => {
    expect(
      resolveTenantSubdomainFromHostname('MediNathi-api.onrender.com', stagingOpts)
    ).toBeNull();
  });

  it('resolves configured tenant subdomain', () => {
    expect(
      resolveTenantSubdomainFromHostname('practice-a.MediNathi-staging.netlify.app', stagingOpts)
    ).toBe('practice-a');
  });

  it('keeps eastern-cape.localhost', () => {
    expect(resolveTenantSubdomainFromHostname('eastern-cape.localhost')).toBe('eastern-cape');
  });
});

const prodOpts = {
  platformHostnames: 'medinathi.co.za,www.medinathi.co.za',
  appBaseDomain: 'medinathi.co.za',
};

describe('canonical ?tenant= on platform hosts', () => {
  it('apex login ?tenant=pilot resolves for UI and API headers', () => {
    expect(resolveUiTenantSubdomain('medinathi.co.za', '?tenant=pilot', prodOpts)).toBe('pilot');
    expect(
      resolveApiTenantSubdomain({
        hostname: 'medinathi.co.za',
        search: '?tenant=pilot',
        cookieValue: null,
        localStorageValue: 'stale-clinic',
        options: prodOpts,
      })
    ).toBe('pilot');
  });

  it('does not treat the apex host itself as a tenant', () => {
    expect(resolveTenantSubdomainFromHostname('medinathi.co.za', prodOpts)).toBeNull();
  });

  it('practice hostname still wins over a conflicting ?tenant=', () => {
    expect(
      resolveApiTenantSubdomain({
        hostname: 'clinic-a.medinathi.co.za',
        search: '?tenant=clinic-b',
        cookieValue: 'clinic-b',
        options: prodOpts,
      })
    ).toBe('clinic-a');
  });

  it('localhost still honors ?tenant= and ignores stale storage', () => {
    expect(
      resolveApiTenantSubdomain({
        hostname: 'localhost',
        search: '?tenant=pilot',
        cookieValue: 'other',
        localStorageValue: 'other',
      })
    ).toBe('pilot');
    expect(
      resolveApiTenantSubdomain({
        hostname: 'localhost',
        search: '',
        cookieValue: 'pilot',
        localStorageValue: 'pilot',
      })
    ).toBeNull();
  });
});

describe('production practice hostnames (frontend)', () => {
  it('allows one-label practice hosts', () => {
    expect(resolveTenantSubdomainFromHostname('pilot.medinathi.co.za', prodOpts)).toBe('pilot');
    expect(resolveTenantSubdomainFromHostname('cape-medical.medinathi.co.za', prodOpts)).toBe(
      'cape-medical'
    );
  });

  it('denies reserved, nested, and lookalike hosts', () => {
    expect(resolveTenantSubdomainFromHostname('api.medinathi.co.za', prodOpts)).toBeNull();
    expect(resolveTenantSubdomainFromHostname('mail.medinathi.co.za', prodOpts)).toBeNull();
    expect(resolveTenantSubdomainFromHostname('www.medinathi.co.za', prodOpts)).toBeNull();
    expect(resolveTenantSubdomainFromHostname('admin.medinathi.co.za', prodOpts)).toBeNull();
    expect(resolveTenantSubdomainFromHostname('super-admin.medinathi.co.za', prodOpts)).toBeNull();
    expect(resolveTenantSubdomainFromHostname('a.b.medinathi.co.za', prodOpts)).toBeNull();
    expect(resolveTenantSubdomainFromHostname('medinathi.co.za.evil.com', prodOpts)).toBeNull();
    expect(resolveTenantSubdomainFromHostname('evilmedinathi.co.za', prodOpts)).toBeNull();
  });

  it('falls back to production base domain when public env is unset', () => {
    const fallback = hostTenantOptionsFromEnv({});
    expect(resolveTenantSubdomainFromHostname('pilot.medinathi.co.za', fallback)).toBe('pilot');
    expect(resolveTenantSubdomainFromHostname('medinathi.co.za', fallback)).toBeNull();
    expect(resolveTenantSubdomainFromHostname('www.medinathi.co.za', fallback)).toBeNull();
  });

  it('keeps explicit staging env over the production fallback', () => {
    const staging = hostTenantOptionsFromEnv({
      NEXT_PUBLIC_PLATFORM_HOSTNAME: 'MediNathi-staging.netlify.app',
      NEXT_PUBLIC_APP_BASE_DOMAIN: 'MediNathi-staging.netlify.app',
    });
    expect(resolveTenantSubdomainFromHostname('MediNathi-staging.netlify.app', staging)).toBeNull();
    expect(
      resolveTenantSubdomainFromHostname('practice-a.MediNathi-staging.netlify.app', staging)
    ).toBe('practice-a');
    expect(resolveTenantSubdomainFromHostname('pilot.medinathi.co.za', staging)).toBeNull();
  });

  it('mirrors the backend reserved label list', () => {
    expect([...DEFAULT_RESERVED_HOST_LABELS].sort()).toEqual(
      ['admin', 'api', 'app', 'localhost', 'mail', 'static', 'super-admin', 'www'].sort()
    );
  });
});
