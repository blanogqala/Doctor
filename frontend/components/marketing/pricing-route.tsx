'use client';

import { MarketingShell } from './marketing-shell';
import { PricingSection } from './pricing-section';
import { FinalCta } from './final-cta';

export function PricingRoute() {
  return (
    <MarketingShell>
      <div>
        <PricingSection />
        <FinalCta />
      </div>
    </MarketingShell>
  );
}
