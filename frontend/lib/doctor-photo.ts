/**
 * Doctor public photo display helpers. Rendering uses one resolved canonical src
 * from practice-info; this module only decides whether that src is usable.
 */
export function shouldRenderDoctorPhoto(
  src: string | null | undefined,
  failedSrc: string | null = null
): src is string {
  if (!src) return false;
  if (failedSrc && failedSrc === src) return false;
  return true;
}
