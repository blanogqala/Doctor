import { describe, expect, it } from 'vitest';
import { demoHref, isMarketingOnlyPath, MARKETING_NAV, trialHref } from './routes';

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
