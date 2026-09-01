import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { demoHref, trialHref } from '@/lib/marketing/routes';
import { MarketingContainer } from './marketing-container';
import { MarketingHeading } from './marketing-heading';
import { SectionReveal } from './section-reveal';

const TRUST = ['Role-based access', 'Audit trails', 'Consent-aware AI', 'Practice isolation'];

export function FinalCta() {
  return (
    <section className="ms-bg-cta py-16 sm:py-24 border-b-2 border-b-[#12A89D]">
      <MarketingContainer>
        <SectionReveal>
          <p className="text-center text-sm font-medium text-slate-600">
            Designed for responsible practice workflows.
          </p>
          <ul className="mt-5 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-slate-700">
            {TRUST.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </SectionReveal>
        <SectionReveal delayMs={60}>
          <div className="mt-12 text-center">
            <MarketingHeading>See what a calmer practice can feel like.</MarketingHeading>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                size="lg"
                className="w-full bg-[#2F63F5] text-white hover:bg-[#2F63F5]/90 sm:w-auto"
                asChild
              >
                <Link href={trialHref()}>Start free trial</Link>
              </Button>
              <Button size="lg" variant="outline" className="w-full sm:w-auto" asChild>
                <Link href={demoHref()}>Book a demo</Link>
              </Button>
            </div>
          </div>
        </SectionReveal>
      </MarketingContainer>
    </section>
  );
}
