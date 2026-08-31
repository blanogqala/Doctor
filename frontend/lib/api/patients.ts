import { apiFetch } from '../api';
import type { Patient, Doctor, Profile } from '../types';

export const patientsApi = {
  list: (q?: string) =>
    apiFetch<Patient[]>(`/api/patients${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  getById: (id: string) => apiFetch<Patient>(`/api/patients/${id}`),
  create: (data: {
    first_name: string;
    last_name: string;
    email?: string;
    phone?: string;
    patient?: Record<string, unknown>;
  }) =>
    apiFetch<Patient>('/api/patients', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Record<string, unknown>) =>
    apiFetch<Patient>(`/api/patients/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  softDelete: (id: string) =>
    apiFetch<Patient>(`/api/patients/${id}`, { method: 'DELETE' }),
  countMedicalRecords: (id: string) =>
    apiFetch<{ count: number }>(`/api/patients/${id}/medical-records/count`),
  checkEmail: (email: string) =>
    apiFetch<{ exists: boolean }>(`/api/patients/check-email?email=${encodeURIComponent(email)}`),
  invitePortal: (id: string) =>
    apiFetch<{
      invitation_issued: boolean;
      email_delivered: boolean;
      portal_status: string;
      invited_at?: string;
      message: string;
      uat_activation_url?: string;
    }>(`/api/patients/${id}/portal-invitations`, { method: 'POST' }),
  resendPortalInvite: (id: string) =>
    apiFetch<{
      invitation_issued: boolean;
      email_delivered: boolean;
      portal_status: string;
      invited_at?: string;
      message: string;
      uat_activation_url?: string;
    }>(`/api/patients/${id}/portal-invitations/resend`, { method: 'POST' }),
};

export const doctorsApi = {
  list: () => apiFetch<Doctor[]>('/api/doctors'),
};

export const profilesApi = {
  update: (data: { full_name?: string; phone?: string }) =>
    apiFetch<Profile>('/api/patients/profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
};
