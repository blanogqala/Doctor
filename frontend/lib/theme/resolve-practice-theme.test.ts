import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  ensureReadablePrimary,
  MEDSPACE_PRIMARY_HEX,
  resolvePracticeTheme,
} from './resolve-practice-theme';

describe('resolvePracticeTheme', () => {
  it('falls back to MedSpace primary for invalid/missing colors', () => {
    const theme = resolvePracticeTheme(null);
    expect(theme.brandHex).toBe(MEDSPACE_PRIMARY_HEX);
    expect(theme.primary).toMatch(/^\d+ \d+% \d+%$/);
    expect(theme.adjusted).toBe(false);
  });

  it('accepts MedSpace blue without adjustment', () => {
    const theme = resolvePracticeTheme('#1E40AF');
    expect(theme.brandHex).toBe('#1E40AF');
    expect(theme.adjusted).toBe(false);
    expect(contrastRatio(theme.brandHex, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('darkens pale brand colors so white text remains readable', () => {
    const theme = resolvePracticeTheme('#F5F5F5');
    expect(theme.adjusted).toBe(true);
    expect(contrastRatio(theme.brandHex, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('handles short hex and missing hash', () => {
    const a = resolvePracticeTheme('1E40AF');
    const b = resolvePracticeTheme('#14B');
    expect(a.brandHex).toBe('#1E40AF');
    expect(b.brandHex).toBe('#1144BB');
  });

  it('ensureReadablePrimary leaves strong colors alone', () => {
    const result = ensureReadablePrimary('#0F4C81');
    expect(result.adjusted).toBe(false);
    expect(result.hex).toBe('#0F4C81');
  });
});
