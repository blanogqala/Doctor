/**
 * Practice logo display helpers. Rendering uses one resolved canonical src
 * from TenantProvider; this module only decides whether that src is usable.
 */
export function shouldRenderPracticeLogo(
  src: string | null | undefined,
  failedSrc: string | null = null
): src is string {
  if (!src) return false;
  if (failedSrc && failedSrc === src) return false;
  return true;
}

export const PRACTICE_LOGO_SIZE_CLASS = {
  sm: 'h-9 w-9 max-h-10 max-w-10',
  md: 'h-12 w-12 max-h-14 max-w-14',
  lg: 'h-14 w-14 max-h-16 max-w-16',
} as const;

export type PracticeLogoSize = keyof typeof PRACTICE_LOGO_SIZE_CLASS;
