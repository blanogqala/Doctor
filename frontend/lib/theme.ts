/**
 * MediNathi brand hex constants for rare inline styles.
 * Prefer CSS tokens / Tailwind semantic classes for UI.
 */
export const theme = {
  primary: '#1E40AF',
  primaryHover: '#1E3A8A',
  primaryLight: '#DBEAFE',
  secondary: '#14B8A6',
  secondaryLight: '#CCFBF1',
  accent: '#F97316',
  accentHover: '#EA580C',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  border: '#E2E8F0',
  textPrimary: '#1E293B',
  textSecondary: '#475569',
  textMuted: '#64748B',
  success: '#059669',
  warning: '#D97706',
  error: '#DC2626',
  info: '#2563EB',
} as const;

export type ThemeColor = keyof typeof theme;

export {
  resolvePracticeTheme,
  applyPracticeThemeToDocument,
  clearPracticeThemeFromDocument,
  practiceThemeCssVars,
  resolveInitialHtmlThemeStyle,
  MediNathi_PRIMARY_HEX,
} from '@/lib/theme/resolve-practice-theme';
export type { PracticeThemeCssVars } from '@/lib/theme/resolve-practice-theme';
