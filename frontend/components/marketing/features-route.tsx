'use client';

import { MarketingShell } from './marketing-shell';
import { FeaturesPageContent } from './features-page-content';

export function FeaturesRoute() {
  return (
    <MarketingShell>
      <FeaturesPageContent />
    </MarketingShell>
  );
}
