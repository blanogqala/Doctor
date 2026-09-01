import { hostTenantOptionsFromEnv, resolveApiTenantSubdomain } from './hostTenant';

/**
 * API origin for credentialed fetches.
 * - Empty / unset in local: same-origin `/api/...` via Next rewrites (cookies work on *.localhost).
 * - Staging/production: absolute Render URL + COOKIE_SAMESITE=None; Secure on the API.
 */
export function getApiBaseUrl(): string {
  const configured = (process.env.NEXT_PUBLIC_API_URL || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  if (typeof window !== 'undefined') return '';
  // SSR fallback when same-origin rewrite is not available in this process
  return (process.env.API_REWRITE_TARGET || 'http://127.0.0.1:3001').replace(/\/$/, '');
}

const API_URL = getApiBaseUrl(); // call-site preferred: getApiBaseUrl()

const CSRF_KEY = 'MediNathi_csrf';
const LEGACY_TOKEN_KEY = 'token';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getTenantHeader(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const host = window.location.hostname.toLowerCase();
  const cookieMatch = document.cookie.match(/(?:^|;\s*)practice_subdomain=([^;]+)/);
  const cookieValue = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
  let localStorageValue: string | null = null;
  try {
    localStorageValue = localStorage.getItem('practice_subdomain');
  } catch {
    localStorageValue = null;
  }

  const subdomain = resolveApiTenantSubdomain({
    hostname: host,
    search: window.location.search,
    cookieValue,
    localStorageValue,
    options: hostTenantOptionsFromEnv(),
  });
  return subdomain ? { 'X-Tenant-Subdomain': subdomain } : {};
}

/** CSRF token for cookie-authenticated mutations (not an auth secret). */
export const csrfStorage = {
  get: () => {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem(CSRF_KEY);
  },
  set: (token: string) => {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(CSRF_KEY, token);
  },
  clear: () => {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(CSRF_KEY);
    // Drop legacy JWT authority if present.
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  },
};

function csrfHeader(): Record<string, string> {
  const csrf = csrfStorage.get();
  return csrf ? { 'X-CSRF-Token': csrf } : {};
}

export async function apiFetch<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const needsCsrf = !['GET', 'HEAD', 'OPTIONS'].includes(method);

  const res = await fetch(`${getApiBaseUrl()}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...getTenantHeader(),
      ...(needsCsrf ? csrfHeader() : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    let message = 'Request failed';
    let code: string | undefined;
    let data: unknown;
    try {
      const body = await res.json();
      message = body.error || message;
      code = body.code;
      data = body;
    } catch {
      // ignore
    }
    throw new ApiError(message, res.status, code, data);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

/** Credentialed FormData upload (do not set Content-Type; browser sets boundary). */
export async function apiFormFetch<T = unknown>(
  endpoint: string,
  form: FormData,
  options: RequestInit = {}
): Promise<T> {
  const method = (options.method || 'POST').toUpperCase();
  const needsCsrf = !['GET', 'HEAD', 'OPTIONS'].includes(method);

  const res = await fetch(`${getApiBaseUrl()}${endpoint}`, {
    ...options,
    method,
    credentials: 'include',
    headers: {
      ...getTenantHeader(),
      ...(needsCsrf ? csrfHeader() : {}),
      ...options.headers,
    },
    body: form,
  });

  if (!res.ok) {
    let message = 'Request failed';
    let code: string | undefined;
    let data: unknown;
    try {
      const body = await res.json();
      message = body.error || message;
      code = body.code;
      data = body;
    } catch {
      // ignore
    }
    throw new ApiError(message, res.status, code, data);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

/** @deprecated Legacy JWT storage — clears only; no longer used as auth authority. */
export const tokenStorage = {
  get: () => null as string | null,
  set: (_token: string) => {
    // no-op: auth is cookie-based
  },
  clear: () => csrfStorage.clear(),
};

export { API_URL };
