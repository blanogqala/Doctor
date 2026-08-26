import { env } from '../config/env';

/** Build a Practice-tenant frontend URL (subdomain host). No secrets/tokens. */
export function practiceFrontendUrl(subdomain: string, path: string): string {
  const base = env.FRONTEND_URL.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (base.includes('localhost:3000')) {
    return `${base.replace('localhost:3000', `${subdomain}.localhost:3000`)}${normalizedPath}`;
  }
  try {
    const url = new URL(base);
    const host = url.hostname.replace(/^www\./, '');
    url.hostname = `${subdomain}.${host}`;
    return `${url.origin}${normalizedPath}`;
  } catch {
    return `${base}${normalizedPath}`;
  }
}
