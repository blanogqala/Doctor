'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  setSuperAdminUnauthorizedHandler,
  superAdminApi,
  superAdminCsrf,
  type SuperAdminUser,
} from '@/lib/api/super-admin';

interface SuperAdminAuthValue {
  /** Non-null when a platform session is hydrated (holds CSRF, not an auth secret). */
  token: string | null;
  user: SuperAdminUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ error: string | null }>;
  logout: () => void;
}

const SuperAdminAuthContext = createContext<SuperAdminAuthValue | undefined>(undefined);

const USER_KEY = 'super_admin_user';

export function SuperAdminAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SuperAdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSuperAdminUnauthorizedHandler(() => {
      localStorage.removeItem(USER_KEY);
      superAdminCsrf.clear();
      setToken(null);
      setUser(null);
      if (
        typeof window !== 'undefined' &&
        !window.location.pathname.startsWith('/super-admin/login')
      ) {
        window.location.href = '/super-admin/login';
      }
    });
    return () => setSuperAdminUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initAuth() {
      // Drop legacy JWT authority.
      localStorage.removeItem('super_admin_token');

      const path = window.location.pathname.replace(/\/$/, '') || '/';
      if (path === '/super-admin/login') {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const data = await superAdminApi.me();
        if (!cancelled) {
          setToken(data.csrf_token);
          setUser(data.user);
          localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        }
      } catch {
        superAdminCsrf.clear();
        localStorage.removeItem(USER_KEY);
        if (!cancelled) {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    initAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const data = await superAdminApi.login(email, password);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      setToken(data.csrf_token);
      setUser(data.user);
      return { error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      return { error: message };
    }
  }, []);

  const logout = useCallback(() => {
    void superAdminApi.logout().catch(() => undefined);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <SuperAdminAuthContext.Provider value={{ token, user, loading, login, logout }}>
      {children}
    </SuperAdminAuthContext.Provider>
  );
}

export function useSuperAdminAuth() {
  const ctx = useContext(SuperAdminAuthContext);
  if (!ctx) throw new Error('useSuperAdminAuth must be used within SuperAdminAuthProvider');
  return ctx;
}
