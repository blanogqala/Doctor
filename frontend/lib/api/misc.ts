import { apiFetch } from '../api';
import type { Payment, Message, AuditLog, TelemedicineConsent } from '../types';

export const paymentsApi = {
  list: (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : '';
    return apiFetch<Payment[]>(`/api/payments${query}`);
  },
  count: (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : '';
    return apiFetch<{ count: number }>(`/api/payments/count${query}`);
  },
  create: (data: Record<string, unknown>) =>
    apiFetch<Payment>('/api/payments', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Record<string, unknown>) =>
    apiFetch<Payment>(`/api/payments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
};

export const messagesApi = {
  list: (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : '';
    return apiFetch<Message[]>(`/api/messages${query}`);
  },
  unreadCount: () =>
    apiFetch<{ count: number }>('/api/messages/unread-count'),
  create: (data: { recipient_id: string; patient_id: string; body: string }) =>
    apiFetch<Message>('/api/messages', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  startAdminChat: () =>
    apiFetch<{
      admin: { id: string; full_name: string; email: string; role: string };
      patient: { id: string; profile_id: string };
      patient_id: string;
      admin_id: string;
    }>('/api/messages/start-admin', { method: 'POST' }),
  markRead: (id: string) =>
    apiFetch<Message>(`/api/messages/${id}/read`, { method: 'PATCH' }),
};

export const auditApi = {
  list: (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : '';
    return apiFetch<AuditLog[]>(`/api/audit-logs${query}`);
  },
  create: (data: {
    action: string;
    resource: string;
    resource_id?: string | null;
    patient_id?: string | null;
    old_value?: Record<string, unknown> | null;
    new_value?: Record<string, unknown> | null;
  }) =>
    apiFetch('/api/audit-logs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

export const telemedicineConsentApi = {
  getForPatient: (patientId: string) =>
    apiFetch<TelemedicineConsent | null>(`/api/telemedicine-consent/patient/${patientId}`),
  create: (data: Record<string, unknown>) =>
    apiFetch<TelemedicineConsent>('/api/telemedicine-consent', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

export const dashboardApi = {
  adminStats: () =>
    apiFetch<{ appointments: number; patients: number; unpaid_payments: number }>(
      '/api/dashboard/admin'
    ),
};
