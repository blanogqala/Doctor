import { getApiBaseUrl } from '../api';

const CSRF_KEY = 'MediNathi_platform_csrf';
const LEGACY_TOKEN_KEY = 'super_admin_token';

export class SuperAdminApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public data?: unknown
  ) {
    super(message);
    this.name = 'SuperAdminApiError';
  }
}

/** Platform CSRF only — auth is HttpOnly cookie-based. */
export const superAdminCsrf = {
  get: () => (typeof window !== 'undefined' ? sessionStorage.getItem(CSRF_KEY) : null),
  set: (token: string) => {
    if (typeof window !== 'undefined') sessionStorage.setItem(CSRF_KEY, token);
  },
  clear: () => {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(CSRF_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  },
};

/** @deprecated Use superAdminCsrf; kept for call-site compatibility. */
export const superAdminToken = {
  get: () => superAdminCsrf.get(),
  set: (token: string) => superAdminCsrf.set(token),
  clear: () => superAdminCsrf.clear(),
};

type SaFetchOptions = RequestInit & { skipAuth?: boolean };

type UnauthorizedHandler = () => void;

let onUnauthorized: UnauthorizedHandler | null = null;

export function setSuperAdminUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  onUnauthorized = handler;
}

async function saFetch<T = unknown>(
  endpoint: string,
  options: SaFetchOptions = {}
): Promise<T> {
  const { skipAuth, ...fetchOptions } = options;
  const method = (fetchOptions.method || 'GET').toUpperCase();
  const needsCsrf = !skipAuth && !['GET', 'HEAD', 'OPTIONS'].includes(method);
  const csrf = needsCsrf ? superAdminCsrf.get() : null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    ...(fetchOptions.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${getApiBaseUrl()}${endpoint}`, {
    ...fetchOptions,
    credentials: 'include',
    headers,
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
    if (res.status === 401 && !skipAuth && endpoint !== '/api/super-admin/login') {
      superAdminCsrf.clear();
      onUnauthorized?.();
    }
    throw new SuperAdminApiError(message, res.status, code, data);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface SuperAdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  is_super_admin: boolean;
}

export interface DashboardStats {
  total_practices: number;
  active_practices: number;
  trial_practices: number;
  suspended_practices: number;
  monthly_recurring_revenue_cents: number;
  configured_monthly_revenue_cents?: number;
  doctor_seats_allocated?: number;
  doctor_seats_limit?: number;
  new_inquiries_count: number;
  owner_invitations_pending?: number;
  trials_ending_soon?: number;
  invoices_awaiting_verification?: number;
  overdue_invoices?: number;
}

export interface InquirySummary {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  practice_name: string | null;
  hpcsa_number: string;
  province: string | null;
  city: string;
  practice_type: string | null;
  requested_subscription_plan: string | null;
  referral_source: string | null;
  message: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface SeatUsage {
  limit: number;
  active: number;
  pending: number;
  allocated: number;
  available: number;
}

export interface OnboardingChecklist {
  practice_created: boolean;
  owner_invited: boolean;
  owner_activated: boolean;
  reception_active: boolean;
  doctor_active: boolean;
}

export interface PracticeSummary {
  id: string;
  subdomain: string;
  clinic_name: string;
  subscription_status: string;
  subscription_suspension_reason?: string | null;
  subscription_suspended_at?: string | null;
  access?: { mode: string; reason?: string | null; suspended_at?: string | null } | null;
  subscription_plan?: string;
  doctor_seat_limit?: number;
  trial_ends_at: string | null;
  monthly_fee_cents: number;
  setup_fee_paid?: boolean;
  brand_color?: string;
  logo_url?: string | null;
  created_at: string;
  owner?: { id: string; full_name: string; email: string } | null;
  seats?: SeatUsage;
  onboarding?: OnboardingChecklist;
  pilot_program?: { status: Exclude<PilotProgramStatus, 'NOT_GRANTED'> } | null;
  doctors?: Array<{
    id: string;
    profile?: { full_name: string; email: string } | null;
  }>;
  _count?: { patients: number; doctors: number };
}

export interface InvitationSummary {
  id: string;
  email: string;
  full_name: string;
  role: string;
  hpcsa_number?: string | null;
  is_practice_owner: boolean;
  status: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
  invited_by_profile?: { full_name: string; email: string } | null;
  invited_by_super_admin?: { name: string; email: string } | null;
}

export interface SubscriptionInvoice {
  id: string;
  practice_id: string;
  invoice_number: string;
  period_start: string;
  period_end: string;
  amount_cents: number;
  status: string;
  due_at: string;
  payment_reported_at: string | null;
  payment_reference: string | null;
  paid_at: string | null;
  payment_method: string | null;
  practice?: { id: string; clinic_name: string; subdomain: string };
}

export interface PracticeWorkspace {
  practice: PracticeSummary & {
    email?: string | null;
    branding_configured?: boolean;
    owner?: { id: string; full_name: string; email: string; is_active?: boolean } | null;
  };
  seats: SeatUsage;
  onboarding: OnboardingChecklist;
  pilot_program: PilotProgramInfo;
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
  activity: Array<{
    id: string;
    action: string;
    resource: string;
    resource_id: string | null;
    created_at: string;
  }>;
}

export interface OnboardPracticeInput {
  clinic_name: string;
  subdomain: string;
  email?: string;
  owner_full_name: string;
  owner_email: string;
  owner_hpcsa_number?: string;
  subscription_plan: string;
  doctor_seat_limit?: number;
  monthly_fee_cents?: number;
  inquiry_id?: string;
  grant_pilot_program?: boolean;
}

export type PilotProgramStatus =
  | 'NOT_GRANTED'
  | 'PENDING_ACTIVATION'
  | 'ACTIVE'
  | 'ENDED';

export interface PilotProgramInfo {
  status: PilotProgramStatus;
  granted_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  duration_days: 30;
}

export interface PatchPracticeInput {
  subscription_status?: string;
  trial_ends_at?: string;
  clinic_name?: string;
  setup_fee_paid?: boolean;
  monthly_fee_cents?: number;
  subscription_plan?: string;
  doctor_seat_limit?: number;
  verify_doctor_id?: string;
}

export interface SupportQueue {
  generated_at: string;
  trial_ending: PracticeSummary[];
  trials_expired?: PracticeSummary[];
  overdue_invoices: Array<SubscriptionInvoice & { practice: { id: string; clinic_name: string; subdomain: string } }>;
  payment_reported: Array<SubscriptionInvoice & { practice: { id: string; clinic_name: string; subdomain: string } }>;
  expired_owner_invites: Array<{ id: string; email: string; full_name: string; practice: { id: string; clinic_name: string } }>;
  unactivated_owners: Array<
    PracticeSummary & {
      owner_invite?: {
        id: string;
        full_name: string;
        email: string;
        status: string;
        sent_at: string;
        expires_at: string;
      } | null;
      owner?: { email?: string } | null;
    }
  >;
  suspended: PracticeSummary[];
  practices?: PracticeSummary[];
}

export const PAYMENT_VERIFIED_REMAINS_READONLY =
  'Payment verified. Practice remains read-only until reactivated.';

export function isBillingRestrictedPractice(p: {
  subscription_status?: string;
  subscription_suspension_reason?: string | null;
  access?: { reason?: string | null } | null;
}): boolean {
  return (
    p.subscription_status === 'SUSPENDED' &&
    (p.access?.reason === 'BILLING_OVERDUE' || p.subscription_suspension_reason === 'BILLING_OVERDUE')
  );
}

export const superAdminApi = {
  login: async (email: string, password: string) => {
    const data = await saFetch<{ csrf_token: string; user: SuperAdminUser }>(
      '/api/super-admin/login',
      {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({ email, password }),
      }
    );
    superAdminCsrf.set(data.csrf_token);
    return data;
  },

  me: async () => {
    const data = await saFetch<{ user: SuperAdminUser; csrf_token: string }>(
      '/api/super-admin/me'
    );
    superAdminCsrf.set(data.csrf_token);
    return data;
  },

  logout: () =>
    saFetch('/api/super-admin/logout', { method: 'POST' }).finally(() =>
      superAdminCsrf.clear()
    ),

  dashboard: () =>
    saFetch<{
      stats: DashboardStats;
      recent_signups: PracticeSummary[];
      recent_inquiries: InquirySummary[];
    }>('/api/super-admin/dashboard'),

  listInquiries: (status?: string) => {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return saFetch<InquirySummary[]>(`/api/super-admin/inquiries${query}`);
  },

  getInquiry: (id: string) =>
    saFetch<InquirySummary>(`/api/super-admin/inquiries/${id}`),

  updateInquiry: (id: string, status: string) =>
    saFetch<InquirySummary>(`/api/super-admin/inquiries/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  notifications: () =>
    saFetch<{ notifications: unknown[]; unread_count: number }>(
      '/api/super-admin/notifications'
    ),

  markNotificationRead: (id: string) =>
    saFetch(`/api/super-admin/notifications/${id}/read`, { method: 'PATCH' }),

  listPractices: (status?: string) => {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return saFetch<PracticeSummary[]>(`/api/super-admin/practices${query}`);
  },

  getPractice: (id: string) => saFetch<PracticeWorkspace>(`/api/super-admin/practices/${id}`),

  createPractice: (data: OnboardPracticeInput) =>
    saFetch<{
      practice: PracticeSummary;
      invitation: InvitationSummary;
      email_delivered: boolean;
      message: string;
      uat_invitation_url?: string;
    }>('/api/super-admin/practices', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updatePractice: (id: string, data: PatchPracticeInput) =>
    saFetch<PracticeSummary>(`/api/super-admin/practices/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  grantPilotProgram: (practiceId: string) =>
    saFetch<{ pilot_program: PilotProgramInfo }>(
      `/api/super-admin/practices/${practiceId}/pilot-program/grant`,
      { method: 'POST', body: JSON.stringify({}) }
    ),

  resendInvitation: (practiceId: string, invitationId: string) =>
    saFetch<{
      invitation: InvitationSummary;
      email_delivered: boolean;
      uat_invitation_url?: string;
    }>(
      `/api/super-admin/practices/${practiceId}/invitations/${invitationId}/resend`,
      { method: 'POST' }
    ),

  revokeInvitation: (practiceId: string, invitationId: string) =>
    saFetch<{ invitation: InvitationSummary }>(
      `/api/super-admin/practices/${practiceId}/invitations/${invitationId}/revoke`,
      { method: 'POST' }
    ),

  billing: (params?: { status?: string; search?: string }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.search) q.set('search', params.search);
    const query = q.toString() ? `?${q.toString()}` : '';
    return saFetch<{
      metrics: {
        configured_monthly_revenue_cents: number;
        paid_this_month_cents: number;
        outstanding_cents: number;
        overdue_cents: number;
      };
      verification_queue: SubscriptionInvoice[];
      invoices: SubscriptionInvoice[];
    }>(`/api/super-admin/billing${query}`);
  },

  generateInvoices: () =>
    saFetch<{ created_count: number; skipped_count: number }>('/api/super-admin/billing/generate', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  verifyInvoice: (id: string) =>
    saFetch<{
      invoice: SubscriptionInvoice;
      already_paid?: boolean;
      remains_suspended?: boolean;
      subscription_status?: string;
      suspension_reason?: string | null;
      message?: string;
    }>(`/api/super-admin/invoices/${id}/verify`, {
      method: 'POST',
    }),

  support: () => saFetch<SupportQueue>('/api/super-admin/support'),
};
