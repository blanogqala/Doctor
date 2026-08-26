import { describe, expect, it } from 'vitest';
import { validatePassword } from './passwordPolicy';

describe('passwordPolicy', () => {
  it('rejects short passwords', () => {
    expect(validatePassword('Ab1')).toEqual({
      ok: false,
      error: 'Password must be at least 10 characters',
    });
  });

  it('requires a letter and a number', () => {
    expect(validatePassword('abcdefghij').ok).toBe(false);
    expect(validatePassword('1234567890').ok).toBe(false);
  });

  it('accepts a valid password', () => {
    expect(validatePassword('EasternCape1')).toEqual({ ok: true });
  });
});
