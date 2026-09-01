import {
  hostTenantOptionsFromEnv,
  resolveTenantSubdomainFromHostname,
  type HostTenantOptions,
} from '@/lib/hostTenant';

export type PracticePathContext = {
  hostname?: string;
  appBaseDomain?: string | null;
  platformHostnames?: string | string[] | null;
};

function pathOptions(ctx?: PracticePathContext): HostTenantOptions {
  const fromEnv = hostTenantOptionsFromEnv();
  return {
    platformHostnames: ctx?.platformHostnames ?? fromEnv.platformHostnames,
    appBaseDomain: ctx?.appBaseDomain ?? fromEnv.appBaseDomain,
  };
}

function appBaseHost(ctx?: PracticePathContext): string {
  return (pathOptions(ctx).appBaseDomain || '')
    .trim()
    .toLowerCase()
    .replace(/^\.+/, '')
    .replace(/^www\./, '');
}

function practiceAbsoluteUrl(subdomain: string, path: string, ctx?: PracticePathContext): string | null {
  const base = appBaseHost(ctx);
  if (!base) return null;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `https://${subdomain}.${base}${normalized}`;
}

function practiceAppPath(
  subdomain: string,
  path: string,
  ctx?: PracticePathContext
): string {
  const slug = subdomain.trim().toLowerCase();
  const hostname = (ctx?.hostname || '').trim().toLowerCase();
  const fromHost = hostname
    ? resolveTenantSubdomainFromHostname(hostname, pathOptions(ctx))
    : null;
  if (fromHost && fromHost === slug) {
    return path;
  }
  if (fromHost && fromHost !== slug) {
    const absolute = practiceAbsoluteUrl(slug, path, ctx);
    if (absolute) return absolute;
  }
  return `${path}?tenant=${encodeURIComponent(slug)}`;
}

export function practiceLoginPath(subdomain: string, ctx?: PracticePathContext): string {
  return practiceAppPath(subdomain, '/login', ctx);
}

export function practiceDashboardPath(subdomain: string, ctx?: PracticePathContext): string {
  return practiceAppPath(subdomain, '/dashboard', ctx);
}

export type InvitationHostAction =
  | { type: 'ok' }
  | { type: 'redirect'; href: string }
  | { type: 'invalid_host' };

/**
 * After token validation: if the browser is on a different valid practice host,
 * send the user to the invitation's practice host (token stays in the query).
 */
export function invitationHostAction(
  invitationSubdomain: string,
  path: '/invite' | '/activate',
  token: string,
  ctx?: PracticePathContext
): InvitationHostAction {
  const slug = invitationSubdomain.trim().toLowerCase();
  const hostname = (ctx?.hostname || '').trim().toLowerCase();
  const fromHost = hostname
    ? resolveTenantSubdomainFromHostname(hostname, pathOptions(ctx))
    : null;
  if (!fromHost || fromHost === slug) {
    return { type: 'ok' };
  }
  const href = practiceAbsoluteUrl(
    slug,
    `${path}?token=${encodeURIComponent(token)}`,
    ctx
  );
  if (!href) return { type: 'invalid_host' };
  return { type: 'redirect', href };
}

export function invitationRoleLabel(role: string, isPracticeOwner: boolean): string {
  if (isPracticeOwner) return 'Practice Owner';
  const normalized = role.trim().toUpperCase();
  if (normalized === 'ADMIN') return 'Reception';
  if (normalized === 'DOCTOR') return 'Doctor';
  return role;
}

export function invitationUserMessage(input: {
  code?: string;
  status?: number;
  fallback?: string;
}): string {
  switch (input.code) {
    case 'INVITATION_EXPIRED':
      return 'This invitation has expired. Please ask your practice administrator to send a new invitation.';
    case 'INVITATION_ACCEPTED':
      return 'This invitation has already been used. If you already have an account, you can sign in.';
    case 'INVITATION_REVOKED':
      return 'This invitation is no longer valid. Please ask your practice administrator to send a new invitation.';
    case 'INVITATION_HOST_MISMATCH':
      return 'This invitation is not valid on this practice site. Open the link from your invitation email.';
    case 'INVITATION_INVALID':
      return 'This invitation link is not valid. Please ask your practice administrator for a new invitation.';
    case 'PRACTICE_CANCELLED':
      return 'This practice is no longer active. Please contact MediNathi support if you need help.';
    default:
      break;
  }

  if (input.status === 409) {
    return (
      input.fallback ||
      'This invitation cannot be used. The email may already have an account, or the invitation is no longer available.'
    );
  }
  if (input.status && input.status >= 500) {
    return 'MediNathi is temporarily unavailable. Please try again in a few minutes.';
  }
  if (input.fallback) return input.fallback;
  return 'We could not process this invitation. Please try again or ask your practice administrator for a new invitation.';
}
