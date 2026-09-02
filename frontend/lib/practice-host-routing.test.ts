import { describe, expect, it } from 'vitest';
import { decidePracticeHostRoute } from './practice-host-routing';

const prodOpts = {
  platformHostnames: 'medinathi.co.za,www.medinathi.co.za',
  appBaseDomain: 'medinathi.co.za',
};

describe('decidePracticeHostRoute', () => {
  it('keeps medinathi.co.za/ as the platform/public site', () => {
    expect(
      decidePracticeHostRoute({ host: 'medinathi.co.za', pathname: '/', options: prodOpts })
    ).toEqual({ tenant: null, redirectPath: null });
  });

  it('sends pilot.medinathi.co.za/ to /login without ?tenant=', () => {
    expect(
      decidePracticeHostRoute({
        host: 'pilot.medinathi.co.za',
        pathname: '/',
        options: prodOpts,
      })
    ).toEqual({ tenant: 'pilot', redirectPath: '/login' });
  });

  it('keeps pilot.medinathi.co.za/login on tenant pilot', () => {
    expect(
      decidePracticeHostRoute({
        host: 'pilot.medinathi.co.za',
        pathname: '/login',
        options: prodOpts,
      })
    ).toEqual({ tenant: 'pilot', redirectPath: null });
  });

  it('keeps pilot.medinathi.co.za/dashboard on tenant pilot', () => {
    expect(
      decidePracticeHostRoute({
        host: 'pilot.medinathi.co.za',
        pathname: '/dashboard',
        options: prodOpts,
      })
    ).toEqual({ tenant: 'pilot', redirectPath: null });
  });

  it('never sends a practice hostname to Super Admin', () => {
    expect(
      decidePracticeHostRoute({
        host: 'pilot.medinathi.co.za',
        pathname: '/super-admin',
        options: prodOpts,
      })
    ).toEqual({ tenant: 'pilot', redirectPath: '/login' });
    expect(
      decidePracticeHostRoute({
        host: 'pilot.medinathi.co.za',
        pathname: '/super-admin/login',
        options: prodOpts,
      })
    ).toEqual({ tenant: 'pilot', redirectPath: '/login' });
    expect(
      decidePracticeHostRoute({
        host: 'pilot.medinathi.co.za',
        pathname: '/super-admin/dashboard',
        options: prodOpts,
      }).redirectPath
    ).not.toMatch(/super-admin/);
  });

  it('does not treat reserved hosts as practices', () => {
    for (const host of [
      'www.medinathi.co.za',
      'api.medinathi.co.za',
      'mail.medinathi.co.za',
      'admin.medinathi.co.za',
      'super-admin.medinathi.co.za',
    ]) {
      expect(decidePracticeHostRoute({ host, pathname: '/', options: prodOpts })).toEqual({
        tenant: null,
        redirectPath: null,
      });
    }
  });

  it('redirects practice marketing paths to /login, not Super Admin', () => {
    expect(
      decidePracticeHostRoute({
        host: 'pilot.medinathi.co.za',
        pathname: '/pricing',
        options: prodOpts,
      })
    ).toEqual({ tenant: 'pilot', redirectPath: '/login' });
  });
});
