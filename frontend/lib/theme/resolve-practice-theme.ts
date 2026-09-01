/**
 * Resolves a practice brand color into safe CSS custom-property values.
 * Status colors (success/warning/danger/info) are never overridden.
 */

export const MediNathi_PRIMARY_HEX = '#1E40AF';

export interface ResolvedPracticeTheme {
  brandHex: string;
  /** Space-separated HSL channels, e.g. "222 65% 38%" */
  primary: string;
  primaryForeground: string;
  primarySoft: string;
  ring: string;
  /** Whether the brand was adjusted for contrast */
  adjusted: boolean;
}

const AA_NORMAL = 4.5;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function normalizeHex(input: string | null | undefined): string | null {
  if (!input) return null;
  let h = input.trim();
  if (!h.startsWith('#')) h = `#${h}`;
  if (/^#[0-9a-fA-F]{3}$/.test(h)) {
    const r = h[1];
    const g = h[2];
    const b = h[3];
    h = `#${r}${r}${g}${g}${b}${b}`;
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(h)) return null;
  return h.toUpperCase();
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) =>
    clamp(Math.round(v), 0, 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

/** Relative luminance (WCAG). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const lin = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function contrastRatio(hexA: string, hexB: string): number {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case rn:
      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
      break;
    case gn:
      h = ((bn - rn) / d + 2) / 6;
      break;
    default:
      h = ((rn - gn) / d + 4) / 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hn = ((h % 360) + 360) % 360 / 360;
  const sn = clamp(s, 0, 100) / 100;
  const ln = clamp(l, 0, 100) / 100;

  if (sn === 0) {
    const v = Math.round(ln * 255);
    return { r: v, g: v, b: v };
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  return {
    r: Math.round(hue2rgb(p, q, hn + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, hn) * 255),
    b: Math.round(hue2rgb(p, q, hn - 1 / 3) * 255),
  };
}

function formatHslChannels(h: number, s: number, l: number): string {
  return `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`;
}

function pickForeground(bgHex: string): { hex: string; channels: string } {
  const white = '#FFFFFF';
  const dark = '#0F172A';
  const whiteRatio = contrastRatio(bgHex, white);
  const darkRatio = contrastRatio(bgHex, dark);
  if (whiteRatio >= AA_NORMAL || whiteRatio >= darkRatio) {
    return { hex: white, channels: '210 40% 98%' };
  }
  return { hex: dark, channels: '222 47% 11%' };
}

/**
 * Adjust brand toward a readable primary for white text on buttons/nav.
 * Prefer darkening light colors; lighten only if still failing after darken.
 */
export function ensureReadablePrimary(hex: string): { hex: string; adjusted: boolean } {
  const white = '#FFFFFF';
  if (contrastRatio(hex, white) >= AA_NORMAL) {
    return { hex, adjusted: false };
  }

  const { r, g, b } = hexToRgb(hex);
  const hsl = rgbToHsl(r, g, b);
  let adjusted = false;
  let l = hsl.l;

  // Darken until AA vs white or floor
  while (l > 22) {
    l -= 4;
    adjusted = true;
    const rgb = hslToRgb(hsl.h, Math.max(hsl.s, 35), l);
    const candidate = rgbToHex(rgb.r, rgb.g, rgb.b);
    if (contrastRatio(candidate, white) >= AA_NORMAL) {
      return { hex: candidate, adjusted };
    }
  }

  // Last resort: MediNathi primary
  return { hex: MediNathi_PRIMARY_HEX, adjusted: true };
}

export function resolvePracticeTheme(
  brandColor: string | null | undefined
): ResolvedPracticeTheme {
  const normalized = normalizeHex(brandColor) ?? MediNathi_PRIMARY_HEX;
  const { hex: safeHex, adjusted } = ensureReadablePrimary(normalized);
  const { r, g, b } = hexToRgb(safeHex);
  const hsl = rgbToHsl(r, g, b);
  const fg = pickForeground(safeHex);

  // Soft tint: same hue, low saturation, high lightness
  const softL = clamp(Math.max(hsl.l, 92), 90, 96);
  const softS = clamp(hsl.s * 0.35, 18, 45);

  return {
    brandHex: safeHex,
    primary: formatHslChannels(hsl.h, clamp(hsl.s, 40, 75), clamp(hsl.l, 28, 48)),
    primaryForeground: fg.channels,
    primarySoft: formatHslChannels(hsl.h, softS, softL),
    ring: formatHslChannels(hsl.h, clamp(hsl.s, 45, 80), clamp(hsl.l, 35, 50)),
    adjusted,
  };
}

/** Apply resolved theme to documentElement. Does not touch status tokens. */
export function applyPracticeThemeToDocument(
  theme: ResolvedPracticeTheme,
  target: HTMLElement = document.documentElement
): void {
  target.style.setProperty('--brand-hex', theme.brandHex);
  target.style.setProperty('--primary', theme.primary);
  target.style.setProperty('--primary-foreground', theme.primaryForeground);
  target.style.setProperty('--primary-soft', theme.primarySoft);
  target.style.setProperty('--ring', theme.ring);
}

export function clearPracticeThemeFromDocument(
  target: HTMLElement = document.documentElement
): void {
  target.style.removeProperty('--brand-hex');
  target.style.removeProperty('--primary');
  target.style.removeProperty('--primary-foreground');
  target.style.removeProperty('--primary-soft');
  target.style.removeProperty('--ring');
}
