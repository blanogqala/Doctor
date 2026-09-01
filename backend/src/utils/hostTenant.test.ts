import { describe, expect, it } from 'vitest';
import { resolveTenantSubdomainFromHostname } from './hostTenant';

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
