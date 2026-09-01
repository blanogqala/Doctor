'use client';

import { MarketingShell } from './marketing-shell';
import { HeroSection } from './hero-section';
import { ProductProofSection } from './product-proof-section';
import { JourneySection } from './journey-section';
import { CopilotSection } from './copilot-section';
import { PracticeSplitSection } from './practice-split-section';
import { FinalCta } from './final-cta';

export function MarketingPage() {
  return (
    <MarketingShell>
      <HeroSection />
      <ProductProofSection />
      <JourneySection />
      <CopilotSection />
      <PracticeSplitSection />
      <FinalCta />
    </MarketingShell>
  );
}
