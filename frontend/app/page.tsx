'use client';

import { HeartPulse } from 'lucide-react';
import { useTenant } from '@/lib/tenant';
import { MarketingPage } from '@/components/marketing/marketing-page';
import { PracticeLanding } from '@/components/practice/practice-landing';

export default function Home() {
  const { subdomain, loading } = useTenant();

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
