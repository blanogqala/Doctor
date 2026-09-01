import { describe, expect, it } from 'vitest';
import { isAllowedBrowserOrigin } from '../middleware/csrf';

/** CSRF re-exports the shared origin validator used by CORS. */
const prod = {
  frontendUrl: 'https://medinathi.co.za',
  nodeEnv: 'production' as const,
  appBaseDomain: 'medinathi.co.za',
};

describe('CSRF origin validator (shared with CORS)', () => {
  it('allows a valid practice origin', () => {
    expect(isAllowedBrowserOrigin('https://pilot.medinathi.co.za', prod)).toBe(true);
  });

  it('rejects HTTP tenant origins in production', () => {
    expect(isAllowedBrowserOrigin('http://pilot.medinathi.co.za', prod)).toBe(false);
  });

  it('rejects reserved API host via tenant wildcard', () => {
    expect(isAllowedBrowserOrigin('https://api.medinathi.co.za', prod)).toBe(false);
  });
});
