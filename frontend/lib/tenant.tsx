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
  applyPracticeThemeToDocument,
  clearPracticeThemeFromDocument,
  resolvePracticeTheme,
} from '@/lib/theme/resolve-practice-theme';

import { getApiBaseUrl } from '@/lib/api';
import { resolvePublicAssetUrl } from '@/lib/public-asset-url';
import { hostTenantOptionsFromEnv, resolveUiTenantSubdomain } from '@/lib/hostTenant';
import {
  fetchPublicPracticeInfo,
  type PracticeInfo,
} from '@/lib/public-practice-info';

export type {
  PracticeInfo,
  PracticeDoctorSummary,
  PracticeOfficeHours,
  LandingServiceItem,
} from '@/lib/public-practice-info';

interface TenantContextValue {
  subdomain: string | null;
  isPlatformHost: boolean;
  practice: PracticeInfo | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  logoSrc: string | null;
}

const TenantContext = createContext<TenantContextValue | null>(null);

const STORAGE_KEY = 'practice_subdomain';

export function resolveSubdomainFromHost(): string | null {
  if (typeof window === 'undefined') return null;
  return resolveUiTenantSubdomain(
    window.location.hostname,
    window.location.search,
    hostTenantOptionsFromEnv()
  );
}

export function getTenantSubdomain(): string | null {
  return resolveSubdomainFromHost();
}

/** @deprecated Prefer resolvePublicAssetUrl — kept as a stable alias. */
export const absoluteApiUrl = resolvePublicAssetUrl;

function cookiePracticeSubdomain(): string | null {
  if (typeof document === 'undefined') return null;
  const cookieMatch = document.cookie.match(/(?:^|;\s*)practice_subdomain=([^;]+)/);
  return cookieMatch ? decodeURIComponent(cookieMatch[1]).toLowerCase() : null;
}

function persistResolvedSubdomain(resolved: string | null): void {
  if (typeof window === 'undefined') return;
  if (resolved) {
    localStorage.setItem(STORAGE_KEY, resolved);
    return;
  }
  const host = window.location.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1') {
    localStorage.removeItem(STORAGE_KEY);
    document.cookie = 'practice_subdomain=; Max-Age=0; path=/';
  }
}

export function TenantProvider({
  children,
  initialSubdomain = null,
  initialPractice = null,
}: {
  children: ReactNode;
  initialSubdomain?: string | null;
  initialPractice?: PracticeInfo | null;
}) {
  const [subdomain, setSubdomain] = useState<string | null>(initialSubdomain);
  const [practice, setPractice] = useState<PracticeInfo | null>(initialPractice);
  const [loading, setLoading] = useState(() => !(initialPractice || !initialSubdomain));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const resolved = resolveSubdomainFromHost() || cookiePracticeSubdomain();
    setSubdomain(resolved);
    persistResolvedSubdomain(resolved);

    // Super-admin pages don't need practice branding
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/super-admin')) {
      setPractice(null);
      setLoading(false);
      setError(null);
      clearPracticeThemeFromDocument();
      return;
    }

    if (!resolved) {
      setPractice(null);
      setLoading(false);
      setError(null);
      clearPracticeThemeFromDocument();
      return;
    }

    setLoading(true);
    try {
      const info = await fetchPublicPracticeInfo(resolved, getApiBaseUrl());
      if (!info) {
        setPractice(null);
        setError('Practice not found');
        clearPracticeThemeFromDocument();
        return;
      }
      setPractice(info);
      setError(null);
      applyPracticeThemeToDocument(resolvePracticeTheme(info.brand_color));
    } catch (err) {
      setPractice(null);
      setError(err instanceof Error ? err.message : 'Failed to load practice');
      clearPracticeThemeFromDocument();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/super-admin')) {
      void refresh();
      return;
    }

    const hostSub = resolveSubdomainFromHost() || cookiePracticeSubdomain();
    if (initialPractice && hostSub && hostSub === initialPractice.subdomain) {
      persistResolvedSubdomain(hostSub);
      setSubdomain(hostSub);
      applyPracticeThemeToDocument(resolvePracticeTheme(initialPractice.brand_color));
      return;
    }

    void refresh();
  }, [refresh, initialPractice]);

  const value: TenantContextValue = {
    subdomain,
    isPlatformHost: !subdomain,
    practice,
    loading,
    error,
    refresh,
    logoSrc: resolvePublicAssetUrl(practice?.logo_url),
  };

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error('useTenant must be used within TenantProvider');
  }
  return ctx;
}
