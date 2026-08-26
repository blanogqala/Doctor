import { beforeEach, describe, expect, it, vi } from 'vitest';

const sessionStore = new Map<string, string>();
const localStore = new Map<string, string>();

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

vi.stubGlobal('window', { location: { hostname: 'localhost', search: '' } });

import { csrfStorage } from './api';

describe('csrfStorage', () => {
  beforeEach(() => {
    sessionStore.clear();
    localStore.clear();
  });

  it('stores CSRF for mutations and clears legacy JWT on clear', () => {
    localStore.set('token', 'legacy-jwt');
    csrfStorage.set('csrf-abc');
    expect(csrfStorage.get()).toBe('csrf-abc');
    csrfStorage.clear();
    expect(csrfStorage.get()).toBeNull();
    expect(localStore.get('token')).toBeUndefined();
  });
});
