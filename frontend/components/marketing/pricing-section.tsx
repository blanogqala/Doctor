'use client';

import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import { SectionReveal } from './section-reveal';
import { cn } from '@/lib/utils';
import {
  SUBSCRIPTION_PLANS,
  HIGHLIGHTED_MARKETING_PLAN,
  marketingPlanLabel,
  marketingTagline,
  formatPlanPrice,
  planFeaturesForMarketing,
  type SubscriptionPlan,
} from '@/lib/subscription-plans';

interface PricingSectionProps {
  onGetStarted: (plan: SubscriptionPlan | null) => void;
}

export function PricingSection({ onGetStarted }: PricingSectionProps) {
  return (
    <section id="pricing" className="relative overflow-hidden bg-white py-16 sm:py-20">
      <div
        className="pointer-events-none absolute -left-20 top-20 h-64 w-64 rounded-full bg-secondary/10 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-20 bottom-10 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
        aria-hidden
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionReveal>
          <div className="text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-slate-800 sm:text-4xl">
              Simple Pricing for Every Practice Size
            </h2>
            <p className="mt-4 text-base text-slate-500 sm:text-lg">
              Transparent monthly pricing. No setup fees.
            </p>
          </div>
        </SectionReveal>

        <div className="mt-14 grid items-stretch gap-6 sm:grid-cols-2 sm:gap-8 xl:grid-cols-4">
          {SUBSCRIPTION_PLANS.map((tier, i) => {
            const highlighted = tier.plan === HIGHLIGHTED_MARKETING_PLAN;
            const { price, period } = formatPlanPrice(tier.plan);
            const features = planFeaturesForMarketing(tier.plan);

            return (
              <SectionReveal key={tier.plan} delayMs={i * 80}>
                <div
                  className={cn(
                    'relative flex h-full flex-col rounded-2xl border bg-white p-6 transition-all duration-300 sm:p-8',
                    highlighted
                      ? 'z-10 border-2 border-secondary shadow-xl shadow-slate-200/80 xl:scale-105'
                      : 'border-slate-200 shadow-sm hover:-translate-y-1 hover:shadow-md'
                  )}
                >
                  {highlighted && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-4 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                      Most Popular
                    </span>
                  )}

                  <h3 className="text-xl font-semibold text-slate-800">
                    {marketingPlanLabel(tier.plan)}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">{marketingTagline(tier.plan)}</p>

                  <div className="mt-6">
                    <span className="text-3xl font-bold tracking-tight text-slate-800 sm:text-4xl">
                      {price}
                    </span>
                    {period && (
                      <span className="ml-1 text-base text-slate-500">{period}</span>
                    )}
                  </div>

                  <ul className="mt-8 flex-1 space-y-3">
                    {features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm text-slate-600">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <Button
                    size="lg"
                    className={cn(
                      'mt-8 w-full transition-transform hover:scale-[1.02]',
                      highlighted
                        ? 'bg-accent text-white hover:bg-accent/90'
                        : 'border-2 border-secondary bg-transparent text-secondary hover:bg-secondary hover:text-white'
                    )}
                    variant={highlighted ? 'default' : 'outline'}
                    onClick={() => onGetStarted(tier.plan)}
                  >
                    Get Started
                  </Button>
                </div>
              </SectionReveal>
            );
          })}
        </div>

        <SectionReveal>
          <div className="mt-12 text-center">
            <Button
              size="lg"
              className="bg-primary text-white hover:bg-primary/90"
              onClick={() => onGetStarted(null)}
            >
              Request Your 14-Day Free Trial
            </Button>
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}
