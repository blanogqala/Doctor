export function practiceLoginPath(subdomain: string): string {
  const slug = subdomain.trim().toLowerCase();
  return `/login?tenant=${encodeURIComponent(slug)}`;
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
