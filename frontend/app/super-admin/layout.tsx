'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Shield } from 'lucide-react';
import {
  SuperAdminAuthProvider,
  useSuperAdminAuth,
} from '@/lib/super-admin-auth';
import { AppShell } from '@/components/layout/app-shell';
import { platformAdminNavigation } from '@/lib/navigation';
import { clearPracticeThemeFromDocument } from '@/lib/theme/resolve-practice-theme';
import { useTenant } from '@/lib/tenant';
import { Skeleton } from '@/components/ui/skeleton';

const BASE_PATH = '/super-admin/dashboard';

function SuperAdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { token, user, loading, logout } = useSuperAdminAuth();
  const { subdomain: practiceTenant } = useTenant();
  const isLogin = pathname === '/super-admin/login';

  useEffect(() => {
    clearPracticeThemeFromDocument();
  }, []);

  useEffect(() => {
    if (practiceTenant) {
      router.replace('/login');
    }
  }, [practiceTenant, router]);

  useEffect(() => {
    if (practiceTenant || loading || isLogin) return;
    if (!token) {
      router.replace('/super-admin/login');
    }
  }, [loading, token, isLogin, router, practiceTenant]);

  if (practiceTenant) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 py-8">
        <Skeleton className="h-8 w-8 rounded-full" />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (isLogin) {
    return <>{children}</>;
  }

  if (loading || !token) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 py-8">
        <Skeleton className="h-8 w-8 rounded-full" />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const displayName = user?.name || user?.email || 'Platform Owner';

  return (
    <AppShell
      brand={{
        title: 'MediNathi Admin',
        subtitle: 'Platform Owner',
        homeHref: BASE_PATH,
        fallbackIcon: Shield,
      }}
      variant="platform"
      navItems={platformAdminNavigation}
      roleBasePath={BASE_PATH}
      user={{
        name: displayName,
        email: user?.email,
      }}
      onSignOut={() => {
        logout();
        router.replace('/super-admin/login');
      }}
    >
      {children}
    </AppShell>
  );
}

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SuperAdminAuthProvider>
      <SuperAdminShell>{children}</SuperAdminShell>
    </SuperAdminAuthProvider>
  );
}
