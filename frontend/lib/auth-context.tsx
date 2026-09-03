'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { authApi } from '@/lib/api/auth';
import { csrfStorage } from '@/lib/api';
import type { AuthUser } from '@/lib/types';
import { PRACTICE_ACCESS_CHANGED_EVENT, shouldRefreshPracticeAccessOnce } from '@/lib/practice-access';

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
  const accessRefreshInFlight = useRef(false);
  const userRef = useRef<AuthUser | null>(null);
  userRef.current = user;

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

  const refreshPracticeAccessOnce = useCallback(async () => {
    if (!shouldRefreshPracticeAccessOnce({ inFlight: accessRefreshInFlight.current, user: userRef.current })) {
      return;
    }
    accessRefreshInFlight.current = true;
    try {
      const { user: loadedUser, csrf_token } = await authApi.me();
      if (!loadedUser) return;
      setUser(loadedUser);
      if (csrf_token) setSession({ csrf_token });
    } catch {
      // Keep the existing session. Do not log the user out on a mid-session restriction refresh.
    } finally {
      accessRefreshInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    hydrate().finally(() => setLoading(false));
  }, [hydrate]);

  useEffect(() => {
    const onAccessChanged = () => {
      void refreshPracticeAccessOnce();
    };
    window.addEventListener(PRACTICE_ACCESS_CHANGED_EVENT, onAccessChanged);
    return () => window.removeEventListener(PRACTICE_ACCESS_CHANGED_EVENT, onAccessChanged);
  }, [refreshPracticeAccessOnce]);

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
