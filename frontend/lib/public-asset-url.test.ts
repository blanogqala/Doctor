import { describe, expect, it } from 'vitest';
import { resolvePublicAssetUrl } from './public-asset-url';

describe('resolvePublicAssetUrl', () => {
  it('prefixes relative logo paths with the API origin', () => {
    expect(
      resolvePublicAssetUrl(
        '/api/practice/logo-file/1788357557583-dony7ex2z44.jpg',
        'https://api.medinathi.co.za'
      )
    ).toBe('https://api.medinathi.co.za/api/practice/logo-file/1788357557583-dony7ex2z44.jpg');
  });

  it('does not resolve relative uploads against the frontend host', () => {
    const resolved = resolvePublicAssetUrl('/uploads/logo.png', 'https://api.medinathi.co.za');
    expect(resolved).toBe('https://api.medinathi.co.za/uploads/logo.png');
    expect(resolved).not.toContain('pilot.medinathi.co.za');
  });

  it('passes through absolute storage/CDN URLs', () => {
    expect(
      resolvePublicAssetUrl(
        'https://api.medinathi.co.za/api/public/practice-logos/abc/file.png',
        'https://api.medinathi.co.za'
      )
    ).toBe('https://api.medinathi.co.za/api/public/practice-logos/abc/file.png');
  });

  it('returns null when the logo is missing', () => {
    expect(resolvePublicAssetUrl(null, 'https://api.medinathi.co.za')).toBeNull();
    expect(resolvePublicAssetUrl('', 'https://api.medinathi.co.za')).toBeNull();
  });

  it('keeps same-origin relative paths when the API base is empty (local rewrites)', () => {
    expect(resolvePublicAssetUrl('/api/public/practice-logos/abc/file.png', '')).toBe(
      '/api/public/practice-logos/abc/file.png'
    );
  });
});
