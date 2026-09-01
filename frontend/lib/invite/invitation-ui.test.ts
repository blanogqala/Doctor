import { describe, expect, it } from 'vitest';
import { validatePasswordClient } from '../password-policy';
import {
  invitationRoleLabel,
  invitationUserMessage,
  practiceLoginPath,
} from './invitation-ui';

describe('practiceLoginPath', () => {
  it('retains practice context on the canonical login URL', () => {
    expect(practiceLoginPath('pilot')).toBe('/login?tenant=pilot');
  });

  it('does not require a practice hostname', () => {
    expect(practiceLoginPath('pilot')).not.toContain('pilot.medinathi');
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
