import { getApiBaseUrl } from '../api';

export interface InvitationPreview {
  practice_name: string;
  subdomain: string;
  role: string;
  full_name: string;
  is_practice_owner: boolean;
  email: string;
  expires_at: string;
}

async function inviteFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
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

export const invitationsApi = {
  validate: (token: string) =>
    inviteFetch<InvitationPreview>(`/api/invitations/validate?token=${encodeURIComponent(token)}`),

  accept: (token: string, password: string) =>
    inviteFetch<{ user: unknown; csrf_token: string }>('/api/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),
};
