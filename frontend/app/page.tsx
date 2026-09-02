'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { HeartPulse } from 'lucide-react';
import { useTenant } from '@/lib/tenant';
import { MarketingPage } from '@/components/marketing/marketing-page';
import { PracticeLanding } from '@/components/practice/practice-landing';
import { hostTenantOptionsFromEnv, resolveTenantSubdomainFromHostname } from '@/lib/hostTenant';

export default function Home() {
  const router = useRouter();
  const { subdomain, loading } = useTenant();
  const hostnameTenant =
    typeof window !== 'undefined'
      ? resolveTenantSubdomainFromHostname(window.location.hostname, hostTenantOptionsFromEnv())
      : null;

  useEffect(() => {
    if (hostnameTenant) {
      router.replace('/login');
    }
  }, [hostnameTenant, router]);

  if (hostnameTenant) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <HeartPulse className="h-8 w-8 animate-pulse text-primary" />
      </div>
    );
  }

  if (!subdomain) {
    return <MarketingPage />;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <HeartPulse className="h-8 w-8 animate-pulse text-primary" />
      </div>
    );
  }

  return <PracticeLanding />;
}
