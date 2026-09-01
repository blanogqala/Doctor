'use client';

import { sourceSans } from '@/lib/marketing/fonts';
import { cn } from '@/lib/utils';
import { MarketingHeader } from './marketing-header';
import { MarketingFooter } from './marketing-footer';

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn('marketing-page font-marketing flex min-h-screen flex-col', sourceSans.variable)}>
      <MarketingHeader />
      <main className="flex-1 pt-16">{children}</main>
      <MarketingFooter />
    </div>
  );
}
