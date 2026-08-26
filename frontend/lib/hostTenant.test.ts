import { describe, expect, it } from 'vitest';
import { resolveTenantSubdomainFromHostname } from './hostTenant';

describe('resolveTenantSubdomainFromHostname (frontend)', () => {
  const stagingOpts = {
    platformHostnames: 'medspace-staging.netlify.app,medspace-api.onrender.com',
    appBaseDomain: 'medspace-staging.netlify.app',
  };

  it('does not treat Netlify staging host as tenant', () => {
    expect(
      resolveTenantSubdomainFromHostname('medspace-staging.netlify.app', stagingOpts)
    ).toBeNull();
  });

  it('does not treat Render host as tenant', () => {
    expect(
      resolveTenantSubdomainFromHostname('medspace-api.onrender.com', stagingOpts)
    ).toBeNull();
  });

  it('resolves configured tenant subdomain', () => {
    expect(
      resolveTenantSubdomainFromHostname('practice-a.medspace-staging.netlify.app', stagingOpts)
    ).toBe('practice-a');
  });

  it('keeps eastern-cape.localhost', () => {
    expect(resolveTenantSubdomainFromHostname('eastern-cape.localhost')).toBe('eastern-cape');
  });
});
