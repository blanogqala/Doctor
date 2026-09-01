'use client';

import { MarketingShell } from './marketing-shell';
import { AboutPageContent } from './about-page-content';

export function AboutRoute() {
  return (
    <MarketingShell>
      <AboutPageContent />
    </MarketingShell>
  );
}
