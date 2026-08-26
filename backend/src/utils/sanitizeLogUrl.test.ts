import { describe, expect, it } from 'vitest';
import { sanitizeLogUrl } from './sanitizeLogUrl';

describe('sanitizeLogUrl', () => {
  it('redacts token query params', () => {
    const out = sanitizeLogUrl('/activate?token=super-secret&x=1');
    expect(out).toContain('token=');
    expect(out).toContain('[REDACTED]');
    expect(out).not.toContain('super-secret');
    expect(out).toContain('x=1');
  });

  it('redacts invite path tokens and query', () => {
    const out = sanitizeLogUrl('/invite/raw-token-value?token=abc');
    expect(out).not.toContain('raw-token-value');
    expect(out).not.toContain('abc');
    expect(out).toContain('[REDACTED]');
  });

  it('does not mangle /api/activations routes', () => {
    expect(sanitizeLogUrl('/api/activations/validate')).toBe('/api/activations/validate');
  });

  it('leaves safe routes alone', () => {
    expect(sanitizeLogUrl('/api/patients?page=2')).toBe('/api/patients?page=2');
  });
});
