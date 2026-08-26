import { apiFetch, csrfStorage } from '../api';
import type { AuthUser } from '../types';

interface AuthResponse {
  user: AuthUser;
  csrf_token: string;
}

function rememberCsrf(csrfToken: string | undefined) {
  if (csrfToken) csrfStorage.set(csrfToken);
}

export const authApi = {
  login: async (email: string, password: string) => {
    const data = await apiFetch<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    rememberCsrf(data.csrf_token);
    return data;
  },

  register: async (data: {
    email: string;
    password: string;
    full_name: string;
    phone?: string;
    patient?: Record<string, unknown>;
  }) => {
    const result = await apiFetch<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    rememberCsrf(result.csrf_token);
    return result;
  },

  me: async () => {
    const data = await apiFetch<{ user: AuthUser | null; csrf_token: string | null }>(
      '/api/auth/me'
    );
    if (data.csrf_token) rememberCsrf(data.csrf_token);
    else csrfStorage.clear();
    return data;
  },

  logout: () =>
    apiFetch('/api/auth/logout', { method: 'POST' }).finally(() => csrfStorage.clear()),

  changePassword: async (data: { current_password: string; new_password: string }) => {
    const result = await apiFetch<{ success: boolean }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    csrfStorage.clear();
    return result;
  },

  forgotPassword: (email: string) =>
    apiFetch<{ success: boolean; message: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, password: string) =>
    apiFetch<{ success: boolean; message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),

  adminCreatePatient: (data: {
    email: string;
    full_name: string;
    phone?: string;
    patient: Record<string, unknown>;
  }) =>
    apiFetch<{
      user: AuthUser;
      activation_issued: boolean;
      email_delivered: boolean;
      message: string;
      uat_activation_url?: string;
    }>('/api/auth/admin/create-patient', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  resendPatientActivation: (profileId: string) =>
    apiFetch<{
      activation_issued: boolean;
      email_delivered: boolean;
      message: string;
      uat_activation_url?: string;
    }>(`/api/auth/admin/patients/${profileId}/resend-activation`, {
      method: 'POST',
    }),

  /** @deprecated No JWT authority; kept for call-site compatibility during migration. */
  getToken: () => csrfStorage.get(),
  setToken: (csrf: string) => csrfStorage.set(csrf),
  clearToken: () => csrfStorage.clear(),
};
