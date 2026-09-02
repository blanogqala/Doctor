import { describe, expect, it } from 'vitest';
import { decidePracticeHostRoute } from './practice-host-routing';
import {
  PRACTICE_TENANT_HEADER,
  hostFromRequestHeaders,
  initialPracticeTenantFromHost,
  loginFirstRenderState,
  parsePracticeTenantHeader,
  resolvePracticeTenantForRequest,
} from './requestPracticeTenant';

const prodOpts = {
  platformHostnames: 'medinathi.co.za,www.medinathi.co.za',
  appBaseDomain: 'medinathi.co.za',
};

describe('server + client first-render tenant consistency', () => {
  it('medinathi.co.za/ is platform on both server and client', () => {
    const server = initialPracticeTenantFromHost('medinathi.co.za', prodOpts);
    const client = initialPracticeTenantFromHost('medinathi.co.za', prodOpts);
    expect(server).toBeNull();
    expect(client).toBe(server);
    expect(decidePracticeHostRoute({ host: 'medinathi.co.za', pathname: '/', options: prodOpts }))
      .toEqual({ tenant: null, redirectPath: null });
  });

  it('pilot.medinathi.co.za/ is a middleware redirect to /login before React', () => {
    expect(
      decidePracticeHostRoute({
        host: 'pilot.medinathi.co.za',
        pathname: '/',
        options: prodOpts,
      })
    ).toEqual({ tenant: 'pilot', redirectPath: '/login' });
  });

  it('pilot.medinathi.co.za/login has the same initial tenant server and client', () => {
    const host = 'pilot.medinathi.co.za';
    const serverTenant = resolvePracticeTenantForRequest({
      host,
      headerValue: 'pilot',
      options: prodOpts,
    });
    const clientTenant = initialPracticeTenantFromHost(host, prodOpts);
    expect(serverTenant).toBe('pilot');
    expect(clientTenant).toBe(serverTenant);
    expect(loginFirstRenderState(serverTenant)).toEqual(loginFirstRenderState(clientTenant));
    expect(loginFirstRenderState(serverTenant).showLandingBack).toBe(false);
    expect(
      decidePracticeHostRoute({ host, pathname: '/login', options: prodOpts })
    ).toEqual({ tenant: 'pilot', redirectPath: null });
  });

  it('does not use window-only tenant (the hydration bug)', () => {
    const host = 'pilot.medinathi.co.za';
    const serverUnsafe = typeof window !== 'undefined' ? initialPracticeTenantFromHost(host, prodOpts) : null;
    const clientUnsafe = initialPracticeTenantFromHost(host, prodOpts);
    expect(serverUnsafe).toBeNull();
    expect(clientUnsafe).toBe('pilot');
    expect(serverUnsafe).not.toBe(clientUnsafe);
  });

  it('pilot.medinathi.co.za/super-admin goes to practice login, not platform admin', () => {
    expect(
      decidePracticeHostRoute({
        host: 'pilot.medinathi.co.za',
        pathname: '/super-admin',
        options: prodOpts,
      })
    ).toEqual({ tenant: 'pilot', redirectPath: '/login' });
  });

  it('reserved hosts are not practices', () => {
    for (const host of [
      'api.medinathi.co.za',
      'www.medinathi.co.za',
      'mail.medinathi.co.za',
      'super-admin.medinathi.co.za',
    ]) {
      expect(initialPracticeTenantFromHost(host, prodOpts)).toBeNull();
      expect(
        decidePracticeHostRoute({ host, pathname: '/', options: prodOpts }).redirectPath
      ).toBeNull();
    }
  });

  it('parses the middleware practice tenant header', () => {
    expect(PRACTICE_TENANT_HEADER).toBe('x-practice-tenant');
    expect(parsePracticeTenantHeader('Pilot')).toBe('pilot');
    expect(parsePracticeTenantHeader('')).toBeNull();
    expect(
      hostFromRequestHeaders({
        get: (name) => (name === 'x-forwarded-host' ? 'pilot.medinathi.co.za, cdn.example' : null),
      })
    ).toBe('pilot.medinathi.co.za');
  });
});
