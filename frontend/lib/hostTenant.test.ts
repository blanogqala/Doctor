import { describe, expect, it } from 'vitest';
import { resolveTenantSubdomainFromHostname } from './hostTenant';

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
