'use client';

import { MarketingContainer } from './marketing-container';
import { MarketingHeading } from './marketing-heading';
import { SectionEyebrow } from './section-eyebrow';
import { SectionReveal } from './section-reveal';
import { DoctorDashboardPreview } from './product-previews';

const PRINCIPLES = [
  {
    title: 'Clinician-led',
    copy: 'Clinical decisions and records remain under clinician control.',
  },
  {
    title: 'The right access',
    copy: 'Each role gets the tools needed for its job.',
  },
  {
    title: 'Less administrative friction',
    copy: 'Technology should remove work rather than create another workflow.',
  },
];

export function AboutPageContent() {
  return (
    <section className="ms-bg-hero py-16 sm:py-24 border-b-2 border-b-[#12A89D]">
      <MarketingContainer>
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <SectionReveal>
            <SectionEyebrow>About</SectionEyebrow>
            <MarketingHeading as="h1" className="mt-4">
              We’re building practice software around the people who actually use it.
            </MarketingHeading>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-slate-600">
              MedSpace is an early-stage product for independent doctors and growing medical
              practices.
            </p>
          </SectionReveal>
          <SectionReveal delayMs={80}>
            <DoctorDashboardPreview />
          </SectionReveal>
        </div>
        <div className="mt-16 grid gap-8 sm:grid-cols-3">
          {PRINCIPLES.map((p) => (
            <div key={p.title}>
              <h2 className="text-base font-semibold">{p.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{p.copy}</p>
            </div>
          ))}
        </div>
      </MarketingContainer>
    </section>
  );
}
