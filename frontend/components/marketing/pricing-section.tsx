import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { demoHref, trialHref } from '@/lib/marketing/routes';
import {
  SUBSCRIPTION_PLANS,
  marketingPlanLabel,
  marketingAudienceLabel,
  marketingSeatDescription,
  formatPlanPrice,
  MARKETING_INCLUSION_STRIP,
} from '@/lib/subscription-plans';
import { MarketingContainer } from './marketing-container';
import { MarketingHeading } from './marketing-heading';
import { SectionReveal } from './section-reveal';

export function PricingSection() {
  return (
    <section id="pricing" className="ms-bg-hero py-16 sm:py-20 border-b-2 border-b-[#12A89D]">
      <MarketingContainer>
        <SectionReveal>
          <MarketingHeading>Simple pricing for practices of different sizes.</MarketingHeading>
          <p className="mt-4 max-w-xl text-base text-slate-600">
            Choose the practice size that fits your team. 14-day trial. No setup fees.
          </p>
        </SectionReveal>

        <div className="mt-10 rounded-2xl border-2 border-[#12A89D] bg-white px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#12A89D]">
            Every plan includes
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {MARKETING_INCLUSION_STRIP.map((item) => (
              <li
                key={item}
                className="rounded-full bg-[color:var(--ms-canvas)] px-3 py-1 text-sm text-slate-700"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-10 grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {SUBSCRIPTION_PLANS.map((tier, i) => {
            const { price, period } = formatPlanPrice(tier.plan);
            const isEnterprise = tier.plan === 'ENTERPRISE';

            return (
              <SectionReveal key={tier.plan} delayMs={i * 50}>
                <div className="flex h-full min-h-[280px] flex-col rounded-2xl border-2 border-[#12A89D] bg-white p-6 shadow-[0_16px_40px_-28px_rgba(11,31,51,0.35)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#12A89D]">
                    {marketingAudienceLabel(tier.plan)}
                  </p>
                  <h3 className="mt-3 text-xl font-semibold">{marketingPlanLabel(tier.plan)}</h3>
                  <div className="mt-6">
                    <span className="text-3xl font-semibold tracking-tight">{price}</span>
                    {period && <span className="ml-1 text-sm text-slate-500">{period}</span>}
                  </div>
                  <p className="mt-3 text-sm text-slate-600">{marketingSeatDescription(tier.plan)}</p>
                  <div className="mt-auto pt-8">
                    <Button
                      size="lg"
                      className="w-full bg-[#2F63F5] text-white hover:bg-[#2F63F5]/90"
                      asChild
                    >
                      <Link href={isEnterprise ? demoHref(tier.plan) : trialHref(tier.plan)}>
                        {isEnterprise ? 'Talk to us' : 'Start free trial'}
                      </Link>
                    </Button>
                  </div>
                </div>
              </SectionReveal>
            );
          })}
        </div>
      </MarketingContainer>
    </section>
  );
}
