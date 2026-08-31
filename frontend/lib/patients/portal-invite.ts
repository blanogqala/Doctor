import type { Patient } from '@/lib/types';
import { patientEmail } from './display-name';

export type PortalInviteUiState =
  | { kind: 'no_email'; disabled: true; label: string; hint: string }
  | { kind: 'invite'; disabled: false; label: string; hint?: string }
  | { kind: 'invited'; disabled: false; label: string; resendLabel: string; sentAt?: string | null }
  | { kind: 'active'; disabled: true; label: string };

export function portalInviteUiState(patient: Patient): PortalInviteUiState {
  const email = patientEmail(patient);
  const status = patient.portal_status;

  if (status === 'ACTIVE' || patient.profile?.activated_at) {
    return { kind: 'active', disabled: true, label: 'Portal Active' };
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      kind: 'no_email',
      disabled: true,
      label: 'Invite to Patient Portal',
      hint: 'Add an email address before sending a portal invitation.',
    };
  }

  if (status === 'INVITED') {
    return {
      kind: 'invited',
      disabled: false,
      label: 'Invitation Sent',
      resendLabel: 'Resend Invitation',
      sentAt: patient.portal_invitation_sent_at ?? null,
    };
  }

  return { kind: 'invite', disabled: false, label: 'Invite to Patient Portal' };
}
