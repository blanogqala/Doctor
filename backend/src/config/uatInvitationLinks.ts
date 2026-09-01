import { accountActivationUrl } from '../utils/frontendUrl';
import { resolveAppEnv } from './appEnv';

/**
 * UAT Super Admin invitation link display.
 * APP_ENV is authoritative: production always off; staging/development allow the flag.
 * NODE_ENV=production alone does not block when APP_ENV=staging.
 */
export function isUatInvitationLinksEnabled(): boolean {
  if (resolveAppEnv() === 'production') return false;
  return process.env.ENABLE_UAT_INVITATION_LINKS === 'true';
}

/**
 * Build invite URL for UAT only. Returns undefined when gate is off.
 * Does not log the token or URL.
 */
export function buildUatInvitationUrlIfEnabled(
  subdomain: string,
  token: string
): string | undefined {
  if (!isUatInvitationLinksEnabled()) return undefined;
  if (!token || !subdomain) return undefined;
  return accountActivationUrl(subdomain, `/invite?token=${encodeURIComponent(token)}`);
}
