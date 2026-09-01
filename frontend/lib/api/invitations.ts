import { ApiError, getApiBaseUrl } from '../api';

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
  let res: Response;
  try {
    res = await fetch(`${getApiBaseUrl()}${endpoint}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> | undefined),
      },
    });
  } catch {
    throw new ApiError('MediNathi is temporarily unavailable. Please try again in a few minutes.', 503);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(body.error || 'Request failed', res.status, body.code, body);
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
