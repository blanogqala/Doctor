'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  applyPracticeThemeToDocument,
  clearPracticeThemeFromDocument,
  resolvePracticeTheme,
} from '@/lib/theme/resolve-practice-theme';

import { getApiBaseUrl } from '@/lib/api';
import {
  hostTenantOptionsFromEnv,
  resolveTenantSubdomainFromHostname,
} from '@/lib/hostTenant';

export interface PracticeOfficeHours {
  monFri?: string;
  saturday?: string;
  sunday?: string;
  [key: string]: string | undefined;
}

export interface PracticeDoctorSummary {
  id: string;
  full_name: string;
  specialization: string;
  consultation_fee_cents: number;
  telemedicine_fee_cents: number;
  bio: string | null;
  photo_url: string | null;
  credentials: string[];
  hpcsa_registration_number: string | null;
  is_verified: boolean;
}

export interface LandingServiceItem {
  title: string;
  description: string;
  icon: string;
}

export interface PracticeInfo {
  id: string;
  subdomain: string;
  clinic_name: string;
  logo_url: string | null;
  brand_color: string;
  tagline: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  address_line1: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  map_embed_url: string | null;
  emergency_phone: string | null;
  office_hours: PracticeOfficeHours | null;
  landing_services: LandingServiceItem[] | null;
  services_intro: string | null;
  subscription_status: string;
  trial_ends_at: string | null;
  booking_available?: boolean;
  doctors: PracticeDoctorSummary[];
}

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
  const host = window.location.hostname.toLowerCase();
  // Bare localhost = platform marketing host. Only honor explicit ?tenant=.
  // Do NOT read localStorage here — a leftover demo tenant was hiding the marketing page.
  if (host === 'localhost' || host === '127.0.0.1') {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('tenant');
    if (fromQuery) return fromQuery.toLowerCase();
    return null;
  }
  return resolveTenantSubdomainFromHostname(host, hostTenantOptionsFromEnv());
}

export function getTenantSubdomain(): string | null {
  return resolveSubdomainFromHost();
}

export function absoluteApiUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${getApiBaseUrl()}${path}`;
}

async function fetchPracticeInfo(subdomain: string): Promise<PracticeInfo> {
  const res = await fetch(
    `${getApiBaseUrl()}/api/public/practice-info?subdomain=${encodeURIComponent(subdomain)}`
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Practice not found');
  }
  const data = await res.json();
  return {
    ...data,
    doctors: (data.doctors || []).map((d: PracticeDoctorSummary & { credentials?: string[] }) => ({
      ...d,
      telemedicine_fee_cents: d.telemedicine_fee_cents ?? 45000,
      credentials: Array.isArray(d.credentials) ? d.credentials : [],
      photo_url: d.photo_url ?? null,
    })),
  };
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const [subdomain, setSubdomain] = useState<string | null>(null);
  const [practice, setPractice] = useState<PracticeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isPlatformHost = useMemo(() => {
    if (typeof window === 'undefined') return true;
    const path = window.location.pathname;
    return path.startsWith('/super-admin');
  }, []);

  const refresh = useCallback(async () => {
    const sub = resolveSubdomainFromHost();
    setSubdomain(sub);
    if (sub) {
      localStorage.setItem(STORAGE_KEY, sub);
    } else if (typeof window !== 'undefined') {
      const host = window.location.hostname.toLowerCase();
      if (host === 'localhost' || host === '127.0.0.1') {
        localStorage.removeItem(STORAGE_KEY);
        document.cookie = 'practice_subdomain=; Max-Age=0; path=/';
      }
    }

    // Super-admin pages don't need practice branding
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/super-admin')) {
      setPractice(null);
      setLoading(false);
      setError(null);
      clearPracticeThemeFromDocument();
      return;
    }

    if (!sub) {
      setPractice(null);
      setLoading(false);
      setError(null);
      clearPracticeThemeFromDocument();
      return;
    }

    setLoading(true);
    try {
      const info = await fetchPracticeInfo(sub);
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
    void refresh();
  }, [refresh]);

  const value: TenantContextValue = {
    subdomain,
    isPlatformHost,
    practice,
    loading,
    error,
    refresh,
    logoSrc: absoluteApiUrl(practice?.logo_url),
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
