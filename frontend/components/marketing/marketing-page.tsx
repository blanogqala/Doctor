'use client';

import { useRef, useState } from 'react';
import { MarketingHeader } from './marketing-header';
import { HeroSection } from './hero-section';
import { HowItWorksSection } from './how-it-works-section';
import { FeaturesSection } from './features-section';
import { PricingSection } from './pricing-section';
import { JoinFormSection } from './join-form-section';
import { FaqSection } from './faq-section';
import { MarketingFooter } from './marketing-footer';
import { poppins, playfair } from '@/lib/marketing/fonts';
import { cn } from '@/lib/utils';
import type { SubscriptionPlan } from '@/lib/subscription-plans';

export function MarketingPage() {
  const joinRef = useRef<HTMLDivElement>(null);
  const [requestedPlan, setRequestedPlan] = useState<SubscriptionPlan | null>(null);

  const scrollToJoin = (plan?: SubscriptionPlan | null) => {
    if (plan !== undefined) setRequestedPlan(plan);
    joinRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div
      className={cn(
        'marketing-page font-marketing flex min-h-screen flex-col',
        poppins.variable,
        playfair.variable
      )}
    >
      <MarketingHeader />
      <main>
        <HeroSection onRequestPortal={() => scrollToJoin()} />
        <HowItWorksSection />
        <FeaturesSection />
        <PricingSection onGetStarted={scrollToJoin} />
        <div ref={joinRef}>
          <JoinFormSection
            requestedPlan={requestedPlan}
            onRequestedPlanChange={setRequestedPlan}
          />
        </div>
        <FaqSection />
      </main>
      <MarketingFooter />
    </div>
  );
}
