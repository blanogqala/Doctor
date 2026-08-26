'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authApi } from '@/lib/api/auth';
import { csrfStorage } from '@/lib/api';
import type { AuthUser } from '@/lib/types';

export interface AppSession {
  csrf_token: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  session: AppSession | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<AppSession | null>(null);
  const [loading, setLoading] = useState(true);

  const hydrate = useCallback(async () => {
    try {
      // Clear legacy JWT keys so they cannot be treated as authority.
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
      }
      const { user: loadedUser, csrf_token } = await authApi.me();
      if (!loadedUser) {
        csrfStorage.clear();
        setUser(null);
        setSession(null);
        return;
      }
      setUser(loadedUser);
      setSession(csrf_token ? { csrf_token } : null);
    } catch {
      csrfStorage.clear();
      setUser(null);
      setSession(null);
    }
  }, []);

  useEffect(() => {
    hydrate().finally(() => setLoading(false));
  }, [hydrate]);

  const signIn = async (email: string, password: string) => {
    try {
      const data = await authApi.login(email, password);
      setUser(data.user);
      setSession({ csrf_token: data.csrf_token });
      setLoading(false);
      return { error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      return { error: message };
    }
  };

  const signOut = async () => {
    try {
      await authApi.logout();
    } catch {
      csrfStorage.clear();
    }
    setUser(null);
    setSession(null);
  };

  const refresh = async () => {
    await hydrate();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
