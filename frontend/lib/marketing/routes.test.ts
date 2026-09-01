import { describe, expect, it } from 'vitest';
import { demoHref, isMarketingOnlyPath, MARKETING_NAV, shouldClearPlatformTenantCookie, trialHref } from './routes';

describe('marketing routes', () => {
  it('exposes primary nav destinations', () => {
    expect(MARKETING_NAV.map((l) => l.href)).toEqual([
      '/features',
      '/pricing',
      '/about',
      '/contact',
    ]);
  });

  it('builds trial and demo CTAs with plan prefill', () => {
    expect(trialHref()).toBe('/contact');
    expect(trialHref('CLINIC')).toBe('/contact?plan=CLINIC');
    expect(demoHref()).toBe('/contact?intent=demo');
    expect(demoHref('SOLO')).toBe('/contact?plan=SOLO&intent=demo');
  });

  it('identifies marketing-only paths for tenant isolation', () => {
    expect(isMarketingOnlyPath('/features')).toBe(true);
    expect(isMarketingOnlyPath('/contact')).toBe(true);
    expect(isMarketingOnlyPath('/privacy')).toBe(true);
    expect(isMarketingOnlyPath('/login')).toBe(false);
    expect(isMarketingOnlyPath('/')).toBe(false);
  });
});

describe('shouldClearPlatformTenantCookie', () => {
  it('clears tenant on marketing/home so the public site is not branded as a practice', () => {
    expect(shouldClearPlatformTenantCookie('/')).toBe(true);
    expect(shouldClearPlatformTenantCookie('/pricing')).toBe(true);
    expect(shouldClearPlatformTenantCookie('/super-admin/dashboard')).toBe(true);
  });

  it('keeps tenant on canonical app routes after ?tenant= is dropped', () => {
    expect(shouldClearPlatformTenantCookie('/dashboard')).toBe(false);
    expect(shouldClearPlatformTenantCookie('/login')).toBe(false);
    expect(shouldClearPlatformTenantCookie('/doctor/appointments')).toBe(false);
  });
});
