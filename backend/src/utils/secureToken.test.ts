import { describe, expect, it } from 'vitest';
import { generateSecureToken, hashToken } from './secureToken';

describe('secureToken', () => {
  it('generates unique tokens of sufficient length', () => {
    const a = generateSecureToken();
    const b = generateSecureToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });

  it('hashes deterministically without exposing the raw token', () => {
    const token = generateSecureToken();
    const hash = hashToken(token);
    expect(hash).toBe(hashToken(token));
    expect(hash).not.toBe(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
