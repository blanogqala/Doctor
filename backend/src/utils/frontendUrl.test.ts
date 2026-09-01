import { describe, expect, it } from 'vitest';
import {
  accountActivationUrl,
  canonicalFrontendUrl,
  practiceFrontendUrl,
} from './frontendUrl';

const prod = {
  frontendUrl: 'https://medinathi.co.za',
  platformFrontendUrl: 'https://medinathi.co.za',
};

describe('canonicalFrontendUrl', () => {
  it('uses PLATFORM_FRONTEND_URL when set', () => {
    const url = canonicalFrontendUrl('/invite?token=abc', {
      frontendUrl: 'https://app.example.com',
      platformFrontendUrl: 'https://platform.example.com',
    });
    expect(url).toBe('https://platform.example.com/invite?token=abc');
  });

  it('falls back to FRONTEND_URL', () => {
    const url = canonicalFrontendUrl('/invite?token=abc', {
      frontendUrl: 'https://medinathi.co.za',
    });
    expect(url).toBe('https://medinathi.co.za/invite?token=abc');
  });
});

describe('practiceFrontendUrl', () => {
  it('prefixes the practice slug onto the FRONTEND_URL host', () => {
    const url = practiceFrontendUrl('pilot', '/invite?token=abc', prod);
    expect(url).toBe('https://pilot.medinathi.co.za/invite?token=abc');
  });
});

describe('accountActivationUrl', () => {
  it('production owner invitation uses canonical /invite (not practice host)', () => {
    const url = accountActivationUrl('pilot', '/invite?token=raw-token', {
      ...prod,
      tenantRoutingMode: 'canonical',
    });
    expect(url).toBe('https://medinathi.co.za/invite?token=raw-token');
    expect(url).not.toContain('pilot.medinathi.co.za');
  });

  it('resend uses the same canonical domain', () => {
    const url = accountActivationUrl('pilot', '/invite?token=resent', {
      ...prod,
      tenantRoutingMode: 'canonical',
    });
    expect(url.startsWith('https://medinathi.co.za/invite?token=')).toBe(true);
  });

  it('does not generate practice-subdomain invitation hosts in canonical mode', () => {
    const url = accountActivationUrl('clinic-a', '/invite?token=x', {
      ...prod,
      tenantRoutingMode: 'canonical',
    });
    expect(url).toBe('https://medinathi.co.za/invite?token=x');
    expect(url).not.toMatch(/^https:\/\/clinic-a\./);
  });

  it('subdomain mode still prefixes the practice host', () => {
    const url = accountActivationUrl('pilot', '/invite?token=raw-token', {
      ...prod,
      tenantRoutingMode: 'subdomain',
    });
    expect(url).toBe('https://pilot.medinathi.co.za/invite?token=raw-token');
  });
});
