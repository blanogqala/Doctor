import { accountActivationUrl } from '../utils/frontendUrl';
import { isUatInvitationLinksEnabled } from './uatInvitationLinks';

/**
 * UAT patient activation link display — same APP_ENV-authoritative gate as invitations.
 */
export function isUatActivationLinksEnabled(): boolean {
  return isUatInvitationLinksEnabled();
}

export function buildUatActivationUrlIfEnabled(
  subdomain: string,
  token: string
): string | undefined {
  if (!isUatActivationLinksEnabled()) return undefined;
  if (!token || !subdomain) return undefined;
  return accountActivationUrl(subdomain, `/activate?token=${encodeURIComponent(token)}`);
}
