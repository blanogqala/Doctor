import { beforeEach, describe, expect, it, vi } from 'vitest';

const sessionStore = new Map<string, string>();
const localStore = new Map<string, string>();
const toastError = vi.fn();
const dispatched: Array<{ type: string; detail: unknown }> = [];

vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastError(...args), success: vi.fn() },
}));

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
  getItem: (k: string) => localStore.get(k) ?? null,
  setItem: (k: string, v: string) => {
    localStore.set(k, v);
  },
  removeItem: (k: string) => {
    localStore.delete(k);
  },
  clear: () => localStore.clear(),
});

vi.stubGlobal(
  'window',
  {
    location: { hostname: 'clinic.localhost', search: '' },
    dispatchEvent: (event: Event) => {
      dispatched.push({
        type: event.type,
        detail: (event as CustomEvent).detail,
      });
      return true;
    },
  } as Window & typeof globalThis
);

vi.stubGlobal('document', { cookie: '' });

import { ApiError, apiFetch, csrfStorage } from './api';
import { PRACTICE_ACCESS_CHANGED_EVENT } from './practice-access';

describe('apiFetch PRACTICE_READ_ONLY', () => {
  beforeEach(() => {
    sessionStore.clear();
    localStore.clear();
    dispatched.length = 0;
    toastError.mockClear();
    csrfStorage.set('csrf-keep');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 403,
        json: async () => ({
          error: 'Practice is in read-only mode because the subscription payment is overdue.',
          code: 'PRACTICE_READ_ONLY',
          access_mode: 'READ_ONLY',
        }),
      }))
    );
  });

  it('toasts the backend error, notifies access change, and does not clear CSRF or auth', async () => {
    await expect(apiFetch('/api/appointments', { method: 'POST', body: '{}' })).rejects.toBeInstanceOf(
      ApiError
    );

    expect(csrfStorage.get()).toBe('csrf-keep');
    expect(toastError).toHaveBeenCalled();
    expect(dispatched.some((event) => event.type === PRACTICE_ACCESS_CHANGED_EVENT)).toBe(true);
  });
});
