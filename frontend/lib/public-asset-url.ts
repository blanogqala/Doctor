import { getApiBaseUrl } from './api';

/**
 * Canonical public asset URL resolver.
 * Relative API paths must resolve against the API origin, never the frontend host
 * (e.g. not https://pilot.medinathi.co.za/uploads/...).
 */
export function resolvePublicAssetUrl(
  value: string | null | undefined,
  apiBaseUrl: string = getApiBaseUrl()
): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const pathname = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const origin = apiBaseUrl.replace(/\/$/, '');
  if (!origin) return pathname;
  return `${origin}${pathname}`;
}
