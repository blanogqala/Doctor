/**
 * Redact secrets from request paths/queries before logging.
 * Invitation, activation, and password-reset tokens must never appear in logs.
 */
export function sanitizeLogUrl(rawUrl: string): string {
  if (!rawUrl) return rawUrl;

  let pathname = rawUrl;
  let search = '';
  const q = rawUrl.indexOf('?');
  if (q >= 0) {
    pathname = rawUrl.slice(0, q);
    search = rawUrl.slice(q + 1);
  }

  // Only redact explicit token path segments (not /api/activations/…).
  pathname = pathname
    .replace(/(\/(?:invite|activate|reset-password)\/)[^/?#]+/gi, '$1[REDACTED]')
    .replace(/(\/tokens?\/)[^/?#]+/gi, '$1[REDACTED]');

  const sensitiveKeys = new Set([
    'token',
    'invitation',
    'invite',
    'activation',
    'reset',
    'password',
    'code',
    'key',
    'secret',
    'sid',
    'session',
    'jwt',
    'access_token',
    'refresh_token',
  ]);

  if (!search) return pathname;

  const parts: string[] = [];
  for (const pair of search.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const rawKey = eq >= 0 ? pair.slice(0, eq) : pair;
    let key = rawKey;
    try {
      key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
    } catch {
      // keep raw
    }
    if (sensitiveKeys.has(key.toLowerCase()) || /token|secret|password|key/i.test(key)) {
      parts.push(`${rawKey}=[REDACTED]`);
    } else {
      parts.push(pair);
    }
  }
  const qs = parts.join('&');
  return qs ? `${pathname}?${qs}` : pathname;
}
