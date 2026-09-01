import { describe, expect, it } from 'vitest';
import { DEFAULT_RESERVED_HOST_LABELS, resolveTenantSubdomainFromHostname } from './hostTenant';

describe('resolveTenantSubdomainFromHostname', () => {
  const stagingOpts = {
    platformHostnames: 'MediNathi-staging.netlify.app,MediNathi-api.onrender.com',
    appBaseDomain: 'MediNathi-staging.netlify.app',
  };

  it('does not treat Netlify staging apex as a tenant', () => {
    expect(
      resolveTenantSubdomainFromHostname('MediNathi-staging.netlify.app', stagingOpts)
    ).toBeNull();
  });

  it('does not treat Render API host as a tenant', () => {
    expect(
      resolveTenantSubdomainFromHostname('MediNathi-api.onrender.com', stagingOpts)
    ).toBeNull();
  });

  it('resolves practice under configured APP_BASE_DOMAIN', () => {
    expect(
      resolveTenantSubdomainFromHostname('practice-a.MediNathi-staging.netlify.app', stagingOpts)
    ).toBe('practice-a');
  });

  it('keeps eastern-cape.localhost working without base domain', () => {
    expect(resolveTenantSubdomainFromHostname('eastern-cape.localhost')).toBe('eastern-cape');
  });

  it('returns null for bare localhost', () => {
    expect(resolveTenantSubdomainFromHostname('localhost')).toBeNull();
    expect(resolveTenantSubdomainFromHostname('127.0.0.1:3001')).toBeNull();
  });

  it('does not invent tenants from arbitrary multi-label hosts', () => {
    expect(resolveTenantSubdomainFromHostname('foo.bar.example.com')).toBeNull();
  });
});

const prodOpts = {
  platformHostnames: 'medinathi.co.za,www.medinathi.co.za,api.medinathi.co.za',
  appBaseDomain: 'medinathi.co.za',
};

describe('production APP_BASE_DOMAIN hostnames', () => {
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
    expect(resolveTenantSubdomainFromHostname('a.b.medinathi.co.za', prodOpts)).toBeNull();
    expect(resolveTenantSubdomainFromHostname('medinathi.co.za.evil.com', prodOpts)).toBeNull();
    expect(resolveTenantSubdomainFromHostname('evilmedinathi.co.za', prodOpts)).toBeNull();
    expect(resolveTenantSubdomainFromHostname('medinathi.co.za', prodOpts)).toBeNull();
  });

  it('uses the centralized reserved label list', () => {
    expect([...DEFAULT_RESERVED_HOST_LABELS].sort()).toEqual(
      ['admin', 'api', 'app', 'localhost', 'mail', 'static', 'super-admin', 'www'].sort()
    );
  });
});
