import { describe, expect, it } from 'vitest';
import { shouldRenderPracticeLogo } from './practice-logo';
import { resolvePracticeTheme } from './theme/resolve-practice-theme';

describe('shouldRenderPracticeLogo', () => {
  it('falls back when the logo is missing', () => {
    expect(shouldRenderPracticeLogo(null)).toBe(false);
    expect(shouldRenderPracticeLogo('')).toBe(false);
  });

  it('falls back after a load failure without retrying the same src', () => {
    const src = 'https://api.medinathi.co.za/api/practice/logo-file/missing.jpg';
    expect(shouldRenderPracticeLogo(src, null)).toBe(true);
    expect(shouldRenderPracticeLogo(src, src)).toBe(false);
  });

  it('retries when the src is replaced with a new logo URL', () => {
    const oldSrc = 'https://api.medinathi.co.za/api/public/practice-logos/a/old.png';
    const newSrc = 'https://api.medinathi.co.za/api/public/practice-logos/a/new.png';
    expect(shouldRenderPracticeLogo(newSrc, oldSrc)).toBe(true);
  });
});

describe('theme when logo is missing', () => {
  it('still resolves brand colour without a logo', () => {
    const theme = resolvePracticeTheme('#5b9f6f');
    expect(theme.brandHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(theme.primary).toMatch(/^\d+ \d+% \d+%$/);
    expect(shouldRenderPracticeLogo(null)).toBe(false);
  });
});
