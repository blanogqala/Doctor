import { describe, expect, it } from 'vitest';
import { validatePasswordClient } from '../password-policy';
import {
  invitationHostAction,
  invitationRoleLabel,
  invitationUserMessage,
  practiceDashboardPath,
  practiceLoginPath,
} from './invitation-ui';

describe('practiceLoginPath', () => {
  const prodHost = { appBaseDomain: 'medinathi.co.za' };

  it('retains practice context on the canonical login URL', () => {
    expect(practiceLoginPath('pilot')).toBe('/login?tenant=pilot');
  });

  it('dashboard after login also keeps tenant on the canonical host', () => {
    expect(practiceDashboardPath('pilot')).toBe('/dashboard?tenant=pilot');
  });

  it('does not require a practice hostname', () => {
    expect(practiceLoginPath('pilot')).not.toContain('pilot.medinathi');
  });

  it('on a matching practice hostname omits ?tenant=', () => {
    expect(
      practiceLoginPath('pilot', { hostname: 'pilot.medinathi.co.za', ...prodHost })
    ).toBe('/login');
    expect(
      practiceDashboardPath('pilot', { hostname: 'pilot.medinathi.co.za', ...prodHost })
    ).toBe('/dashboard');
  });

  it('redirects off a mismatched practice hostname without ?tenant=', () => {
    expect(
      practiceLoginPath('pilot', { hostname: 'other-clinic.medinathi.co.za', ...prodHost })
    ).toBe('https://pilot.medinathi.co.za/login');
  });
});

describe('invitationHostAction', () => {
  const prodHost = { appBaseDomain: 'medinathi.co.za' };

  it('is ok on the matching practice host', () => {
    expect(
      invitationHostAction('pilot', '/invite', 'raw-token', {
        hostname: 'pilot.medinathi.co.za',
        ...prodHost,
      })
    ).toEqual({ type: 'ok' });
  });

  it('is ok on the platform host (canonical fallback)', () => {
    expect(
      invitationHostAction('pilot', '/invite', 'raw-token', {
        hostname: 'medinathi.co.za',
        ...prodHost,
      })
    ).toEqual({ type: 'ok' });
  });

  it('redirects to the invitation practice host when on another practice', () => {
    expect(
      invitationHostAction('pilot', '/invite', 'raw-token', {
        hostname: 'other-clinic.medinathi.co.za',
        ...prodHost,
      })
    ).toEqual({
      type: 'redirect',
      href: 'https://pilot.medinathi.co.za/invite?token=raw-token',
    });
  });
});

describe('invitationRoleLabel', () => {
  it('labels practice owners', () => {
    expect(invitationRoleLabel('DOCTOR', true)).toBe('Practice Owner');
  });

  it('labels reception and doctors', () => {
    expect(invitationRoleLabel('ADMIN', false)).toBe('Reception');
    expect(invitationRoleLabel('DOCTOR', false)).toBe('Doctor');
  });
});

describe('invitationUserMessage', () => {
  it('maps expired / used / revoked / invalid without leaking internals', () => {
    expect(invitationUserMessage({ code: 'INVITATION_EXPIRED' })).toMatch(/expired/i);
    expect(invitationUserMessage({ code: 'INVITATION_ACCEPTED' })).toMatch(/already been used/i);
    expect(invitationUserMessage({ code: 'INVITATION_REVOKED' })).toMatch(/no longer valid/i);
    expect(invitationUserMessage({ code: 'INVITATION_INVALID' })).toMatch(/not valid/i);
    expect(invitationUserMessage({ code: 'INVITATION_HOST_MISMATCH' })).toMatch(/not valid on this practice/i);
    expect(invitationUserMessage({ code: 'INVITATION_EXPIRED' })).not.toMatch(/inv-/);
    expect(invitationUserMessage({ status: 503 })).toMatch(/unavailable/i);
  });
});

describe('validatePasswordClient', () => {
  it('enforces length, letter, and number', () => {
    expect(validatePasswordClient('short1')).toMatchObject({ ok: false });
    expect(validatePasswordClient('1234567890')).toMatchObject({ ok: false });
    expect(validatePasswordClient('NoDigitsHere')).toMatchObject({ ok: false });
    expect(validatePasswordClient('SecurePass1')).toEqual({ ok: true });
  });
});
