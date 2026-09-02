'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { HeartPulse } from 'lucide-react';
import { useTenant } from '@/lib/tenant';
import { MarketingPage } from '@/components/marketing/marketing-page';

export default function Home() {
  const router = useRouter();
  const { subdomain } = useTenant();

  useEffect(() => {
    if (subdomain) {
      router.replace('/login');
    }
  }, [subdomain, router]);

  if (subdomain) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <HeartPulse className="h-8 w-8 animate-pulse text-primary" />
      </div>
    );
  }

  return <MarketingPage />;
}
