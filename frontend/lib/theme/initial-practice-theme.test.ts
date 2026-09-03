import { describe, expect, it } from 'vitest';
import {
  MediNathi_PRIMARY_HEX,
  practiceThemeCssVars,
  resolveInitialHtmlThemeStyle,
  resolvePracticeTheme,
} from './resolve-practice-theme';

const STYLESHEET_DEFAULT_PRIMARY = '222 65% 38%';
const PILOT_MAROON = '#800000';
const GREEN_PRACTICE = '#228B22';

describe('resolveInitialHtmlThemeStyle', () => {
  it('pilot maroon: first HTML vars match resolved maroon, not default blue', () => {
    const maroon = resolvePracticeTheme(PILOT_MAROON);
    const style = resolveInitialHtmlThemeStyle({
      subdomain: 'pilot',
      brandingAvailable: true,
      brandColor: PILOT_MAROON,
    });

    expect(style).toEqual(practiceThemeCssVars(maroon));
    expect(style?.['--primary']).toBe(maroon.primary);
    expect(style?.['--primary']).not.toBe(STYLESHEET_DEFAULT_PRIMARY);
    expect(style?.['--primary']).not.toBe(resolvePracticeTheme(MediNathi_PRIMARY_HEX).primary);
  });

  it('green practice: first HTML vars match resolved green', () => {
    const green = resolvePracticeTheme(GREEN_PRACTICE);
    const style = resolveInitialHtmlThemeStyle({
      subdomain: 'eastern-cape',
      brandingAvailable: true,
      brandColor: GREEN_PRACTICE,
    });

    expect(style).toEqual(practiceThemeCssVars(green));
    expect(style?.['--primary']).toBe(green.primary);
    expect(style?.['--primary']).not.toBe(STYLESHEET_DEFAULT_PRIMARY);
  });

  it('still applies brand colour when logo is absent', () => {
    const style = resolveInitialHtmlThemeStyle({
      subdomain: 'pilot',
      brandingAvailable: true,
      brandColor: PILOT_MAROON,
    });
    expect(style?.['--brand-hex']).toBe(PILOT_MAROON);
    expect(style?.['--primary']).not.toBe(STYLESHEET_DEFAULT_PRIMARY);
  });

  it('no custom colour: branding available without brand_color uses default MediNathi theme', () => {
    const fallback = resolvePracticeTheme(null);
    const style = resolveInitialHtmlThemeStyle({
      subdomain: 'pilot',
      brandingAvailable: true,
      brandColor: null,
    });

    expect(style).toEqual(practiceThemeCssVars(fallback));
    expect(style?.['--brand-hex']).toBe(MediNathi_PRIMARY_HEX);
  });

  it('platform host never applies a practice brand (tenant isolation)', () => {
    const style = resolveInitialHtmlThemeStyle({
      subdomain: null,
      brandingAvailable: true,
      brandColor: PILOT_MAROON,
    });
    expect(style).toBeUndefined();
  });

  it('fetch failed: does not emit default-blue inline vars that would later be replaced', () => {
    const style = resolveInitialHtmlThemeStyle({
      subdomain: 'pilot',
      brandingAvailable: false,
      brandColor: PILOT_MAROON,
    });
    expect(style).toBeUndefined();
  });

  it('tenant isolation: pilot maroon vars never equal another practice green vars', () => {
    const pilot = resolveInitialHtmlThemeStyle({
      subdomain: 'pilot',
      brandingAvailable: true,
      brandColor: PILOT_MAROON,
    });
    const other = resolveInitialHtmlThemeStyle({
      subdomain: 'other-practice',
      brandingAvailable: true,
      brandColor: GREEN_PRACTICE,
    });

    expect(pilot).toBeDefined();
    expect(other).toBeDefined();
    expect(pilot?.['--primary']).not.toBe(other?.['--primary']);
    expect(pilot?.['--brand-hex']).not.toBe(other?.['--brand-hex']);
  });

  it('SSR theme equals first client theme for the same subdomain and brand', () => {
    const input = {
      subdomain: 'pilot' as const,
      brandingAvailable: true,
      brandColor: PILOT_MAROON,
    };
    const server = resolveInitialHtmlThemeStyle(input);
    const client = resolveInitialHtmlThemeStyle(input);
    expect(server).toEqual(client);
    expect(server).toEqual(practiceThemeCssVars(resolvePracticeTheme(PILOT_MAROON)));
  });

  it('guard: known custom brand must not start as default blue then swap after hydration', () => {
    const initial = resolveInitialHtmlThemeStyle({
      subdomain: 'pilot',
      brandingAvailable: true,
      brandColor: PILOT_MAROON,
    });
    const afterHydration = practiceThemeCssVars(resolvePracticeTheme(PILOT_MAROON));

    expect(initial).toEqual(afterHydration);
    expect(initial?.['--primary']).not.toBe(STYLESHEET_DEFAULT_PRIMARY);
  });
});
