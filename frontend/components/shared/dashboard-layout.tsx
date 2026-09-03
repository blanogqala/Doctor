'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AlertTriangle, HeartPulse } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useTenant, absoluteApiUrl } from '@/lib/tenant';
import { RoleBadge } from '@/components/shared/badges';
import { AppShell } from '@/components/layout/app-shell';
import { messagesApi } from '@/lib/api/misc';
import { MESSAGES_UNREAD_CHANGED_EVENT } from '@/lib/messages-events';
import { usePollingRefresh } from '@/lib/use-polling-refresh';
import { dashboardRestrictionBanner } from '@/lib/practice-access';
import {
  doctorNavItems,
  doctorNavigation,
  patientNavigation,
  receptionNavigation,
} from '@/lib/navigation';
import {
  applyPracticeThemeToDocument,
  resolvePracticeTheme,
} from '@/lib/theme/resolve-practice-theme';
import type { UserRole } from '@/lib/types';
import { TelemedicineRoomRoot } from '@/components/telemedicine/telemedicine-video-shell';
import { Skeleton } from '@/components/ui/skeleton';

const navByRole = {
  ADMIN: receptionNavigation,
  DOCTOR: doctorNavigation,
  PATIENT: patientNavigation,
} as const;

const roleLabel: Record<UserRole, string> = {
  ADMIN: 'Reception',
  DOCTOR: 'Doctor',
  PATIENT: 'Patient',
};

const roleBasePaths: Record<UserRole, string> = {
  ADMIN: '/admin',
  DOCTOR: '/doctor',
  PATIENT: '/patient',
};

const UNREAD_POLL_MS = 5_000;

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const { practice, logoSrc } = useTenant();
  const router = useRouter();
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);

  const clinicName = practice?.clinic_name || user?.practice?.clinic_name || 'MediNathi';
  const brandColor = practice?.brand_color || user?.practice?.brand_color || undefined;
  const resolvedLogo = logoSrc || absoluteApiUrl(user?.practice?.logo_url);

  const trialEndsAt = practice?.trial_ends_at || user?.practice?.trial_ends_at || null;
  const subscriptionStatus =
    practice?.subscription_status || user?.practice?.subscription_status || null;
  const trialDaysLeft =
    subscriptionStatus === 'TRIAL' && trialEndsAt
      ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : null;

  useEffect(() => {
    if (brandColor) {
      applyPracticeThemeToDocument(resolvePracticeTheme(brandColor));
    }
  }, [brandColor]);

  const refreshUnread = useCallback(async () => {
    if (!user) return;
    try {
      const { count } = await messagesApi.unreadCount();
      setUnreadCount(count);
    } catch {
      // ignore transient errors; keep last known count
    }
  }, [user]);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!loading && user) {
      const basePath = roleBasePaths[user.role];
      const otherRoleBases = Object.values(roleBasePaths).filter((p) => p !== basePath);
      if (otherRoleBases.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
        router.push(basePath);
      }
    }
  }, [user, loading, pathname, router]);

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    void refreshUnread();

    const onUnreadChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ readDelta?: number }>).detail;
      if (typeof detail?.readDelta === 'number' && detail.readDelta > 0) {
        setUnreadCount((prev) => Math.max(0, prev - detail.readDelta!));
      }
      void refreshUnread();
    };
    window.addEventListener(MESSAGES_UNREAD_CHANGED_EVENT, onUnreadChanged);

    return () => {
      window.removeEventListener(MESSAGES_UNREAD_CHANGED_EVENT, onUnreadChanged);
    };
  }, [user, pathname, refreshUnread]);

  usePollingRefresh(refreshUnread, UNREAD_POLL_MS, !!user);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <div className="flex h-14 items-center gap-3 border-b border-border px-4 lg:hidden">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex flex-1">
          <div className="hidden w-60 border-r border-border p-4 lg:block">
            <Skeleton className="mb-6 h-9 w-40" />
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
            <HeartPulse className="h-8 w-8 animate-pulse text-primary" aria-hidden />
            <p className="text-sm text-muted-foreground">Loading…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const navItems =
    user.role === 'DOCTOR'
      ? doctorNavItems(Boolean(user.is_practice_owner))
      : navByRole[user.role] ?? [];
  const basePath = roleBasePaths[user.role];

  return (
    <>
      <AppShell
        brand={{
          title: clinicName,
          subtitle: `${roleLabel[user.role]} Portal`,
          homeHref: '/',
          logoSrc: resolvedLogo,
        }}
        navItems={navItems}
        roleBasePath={basePath}
        user={{
          name: user.profile?.full_name ?? user.email,
          email: user.email,
          badge: <RoleBadge role={user.role} />,
          profileHref: '/profile',
        }}
        onSignOut={() => signOut()}
        unreadCount={unreadCount}
        banner={(() => {
          const restriction = dashboardRestrictionBanner({ user, trialDaysLeft });
          if (!restriction) return null;
          return (
            <div
              className="flex flex-col gap-2 border-b border-warning/30 bg-warning-soft px-4 py-2 text-sm text-warning-foreground sm:flex-row sm:items-center sm:gap-3"
              role="status"
            >
              <div className="flex min-w-0 items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
                <span className="min-w-0 break-words">{restriction.message}</span>
              </div>
              {restriction.showBillingLink ? (
                <Link
                  href="/doctor/practice-management"
                  className="flex-shrink-0 font-medium underline underline-offset-2"
                >
                  Review billing
                </Link>
              ) : null}
            </div>
          );
        })()}
      >
        {children}
      </AppShell>
      <TelemedicineRoomRoot />
    </>
  );
}
