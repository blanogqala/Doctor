import { beforeEach, describe, expect, it, vi } from 'vitest';

const sessionStore = new Map<string, string>();

vi.stubGlobal('sessionStorage', {
  getItem: (k: string) => sessionStore.get(k) ?? null,
  setItem: (k: string, v: string) => {
    sessionStore.set(k, v);
  },
  removeItem: (k: string) => {
    sessionStore.delete(k);
  },
  clear: () => sessionStore.clear(),
});

vi.stubGlobal('localStorage', {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
  clear: () => undefined,
});

vi.stubGlobal('window', { location: { hostname: 'pilot.medinathi.co.za', search: '' } });

import { csrfStorage } from '../api';
import { invitationsApi } from './invitations';

describe('invitationsApi.accept CSRF header', () => {
  beforeEach(() => {
    sessionStore.clear();
  });

  it('sends credentials and X-CSRF-Token when a CSRF secret is already stored', async () => {
    csrfStorage.set('csrf-from-session');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ user: { email: 'a@b.co' }, csrf_token: 'new' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await invitationsApi.accept('invite-token-value', 'SecurePass123!');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe('include');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-from-session');
  });

  it('still posts with credentials when no CSRF secret exists (anonymous leftover-cookie case)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ user: { email: 'a@b.co' }, csrf_token: 'new' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await invitationsApi.accept('invite-token-value', 'SecurePass123!');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe('include');
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBeUndefined();
  });
});
