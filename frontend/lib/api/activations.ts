import { getApiBaseUrl } from '../api';

export interface ActivationPreview {
  practice_name: string;
  subdomain: string;
  full_name: string;
  email: string;
  expires_at: string;
}

async function activationFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || 'Request failed');
  }
  return body as T;
}

export const activationsApi = {
  validate: (token: string) =>
    activationFetch<ActivationPreview>(
      `/api/activations/validate?token=${encodeURIComponent(token)}`
    ),

  accept: (token: string, password: string) =>
    activationFetch<{ user: unknown; csrf_token: string }>('/api/activations/accept', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),
};
