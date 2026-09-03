import { apiFetch } from '../api';
import type { InvitationSummary, SeatUsage, SubscriptionInvoice } from './super-admin';

export interface PracticeManagementSummary {
  practice: {
    id: string;
    clinic_name: string;
    subdomain: string;
    subscription_plan: string;
    subscription_status: string;
    doctor_seat_limit: number;
    monthly_fee_cents: number;
    trial_ends_at: string | null;
    subscription_suspension_reason?: string | null;
    subscription_suspended_at?: string | null;
    access?: { mode: string; reason?: string | null; suspended_at?: string | null } | null;
    clinical_chart_access_mode?: 'ASSIGNED_DOCTOR_ONLY' | 'ALL_ACTIVE_DOCTORS' | null;
    owner?: { id: string; full_name: string; email: string } | null;
  };
  seats: SeatUsage;
  team: Array<{
    id: string;
    full_name: string;
    email: string;
    role: string;
    is_active: boolean;
    last_login_at: string | null;
    doctor?: { id: string; is_verified: boolean; hpcsa_registration_number: string | null } | null;
  }>;
  invitations: InvitationSummary[];
  invoices: SubscriptionInvoice[];
}

export const practiceManagementApi = {
  summary: () => apiFetch<PracticeManagementSummary>('/api/practice-management'),

  inviteDoctor: (data: { full_name: string; email: string; hpcsa_number?: string }) =>
    apiFetch<{ invitation: InvitationSummary; email_delivered: boolean; message: string }>(
      '/api/practice-management/invitations/doctors',
      { method: 'POST', body: JSON.stringify(data) }
    ),

  inviteReception: (data: { full_name: string; email: string }) =>
    apiFetch<{ invitation: InvitationSummary; email_delivered: boolean; message: string }>(
      '/api/practice-management/invitations/reception',
      { method: 'POST', body: JSON.stringify(data) }
    ),

  resendInvitation: (id: string) =>
    apiFetch<{ invitation: InvitationSummary; email_delivered: boolean }>(
      `/api/practice-management/invitations/${id}/resend`,
      { method: 'POST' }
    ),

  revokeInvitation: (id: string) =>
    apiFetch<{ invitation: InvitationSummary }>(
      `/api/practice-management/invitations/${id}/revoke`,
      { method: 'POST' }
    ),

  deactivateMember: (profileId: string) =>
    apiFetch(`/api/practice-management/members/${profileId}/deactivate`, { method: 'POST' }),

  reportPayment: (invoiceId: string, payment_reference: string) =>
    apiFetch<{ invoice: SubscriptionInvoice }>(
      `/api/practice-management/invoices/${invoiceId}/report-payment`,
      { method: 'POST', body: JSON.stringify({ payment_reference }) }
    ),

  eftInstructions: () =>
    apiFetch<{
      configured: boolean;
      instructions: {
        account_holder: string;
        bank: string;
        account_number: string;
        branch_code: string;
        reference_guidance: string;
      } | null;
    }>('/api/practice-management/eft-instructions'),
};
