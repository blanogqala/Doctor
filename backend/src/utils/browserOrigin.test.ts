import { describe, expect, it } from 'vitest';
import {
  isAllowedBrowserOrigin,
  isCorsAllowedOrigin,
  isInvitationOriginMismatch,
} from './browserOrigin';

const prod = {
  frontendUrl: 'https://medinathi.co.za',
  platformFrontendUrl: 'https://medinathi.co.za',
  nodeEnv: 'production',
  appBaseDomain: 'medinathi.co.za',
  platformHostnames: 'api.medinathi.co.za,medinathi.co.za,www.medinathi.co.za',
};

const corsAndCsrfCases: Array<{ origin: string; allowed: boolean; name: string }> = [
  { name: 'pilot practice', origin: 'https://pilot.medinathi.co.za', allowed: true },
  { name: 'hyphenated practice', origin: 'https://cape-medical.medinathi.co.za', allowed: true },
  { name: 'platform frontend exact', origin: 'https://medinathi.co.za', allowed: true },
  { name: 'http tenant in production', origin: 'http://pilot.medinathi.co.za', allowed: false },
  { name: 'nested labels', origin: 'https://a.b.medinathi.co.za', allowed: false },
  { name: 'unrelated domain', origin: 'https://evil.com', allowed: false },
  { name: 'suffix hijack', origin: 'https://medinathi.co.za.evil.com', allowed: false },
  { name: 'prefix lookalike', origin: 'https://evilmedinathi.co.za', allowed: false },
  { name: 'reserved api', origin: 'https://api.medinathi.co.za', allowed: false },
  { name: 'reserved mail', origin: 'https://mail.medinathi.co.za', allowed: false },
  { name: 'reserved www', origin: 'https://www.medinathi.co.za', allowed: false },
];

describe('CORS and CSRF share origin allowlist', () => {
  it.each(corsAndCsrfCases)('$name', ({ origin, allowed }) => {
    expect(isAllowedBrowserOrigin(origin, prod)).toBe(allowed);
    expect(isCorsAllowedOrigin(origin, prod)).toBe(allowed);
  });

  it('CORS allows missing Origin; CSRF does not', () => {
    expect(isCorsAllowedOrigin(undefined, prod)).toBe(true);
    expect(isAllowedBrowserOrigin(undefined, prod)).toBe(false);
  });

  it('explicit CORS_ALLOWED_ORIGINS still works', () => {
    const opts = { ...prod, corsAllowedOrigins: 'https://preview.example.net' };
    expect(isAllowedBrowserOrigin('https://preview.example.net', opts)).toBe(true);
    expect(isCorsAllowedOrigin('https://preview.example.net', opts)).toBe(true);
  });

  it('does not use wildcard *', () => {
    expect(isAllowedBrowserOrigin('*', prod)).toBe(false);
  });
});

describe('isInvitationOriginMismatch', () => {
  it('allows missing Origin (token remains authoritative)', () => {
    expect(isInvitationOriginMismatch(undefined, 'pilot', prod)).toBe(false);
  });

  it('allows platform Origin', () => {
    expect(isInvitationOriginMismatch('https://medinathi.co.za', 'pilot', prod)).toBe(false);
  });

  it('allows matching practice Origin', () => {
    expect(isInvitationOriginMismatch('https://pilot.medinathi.co.za', 'pilot', prod)).toBe(false);
  });

  it('rejects a different valid practice Origin', () => {
    expect(
      isInvitationOriginMismatch('https://other-clinic.medinathi.co.za', 'pilot', prod)
    ).toBe(true);
  });
});
