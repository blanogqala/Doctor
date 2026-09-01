import { MarketingContainer } from './marketing-container';
import { MarketingHeading } from './marketing-heading';
import { SectionEyebrow } from './section-eyebrow';
import { SectionReveal } from './section-reveal';
import { CopilotPreview } from './product-previews';

const STEPS = ['Capture', 'Structure', 'Review'] as const;

export function CopilotSection() {
  return (
    <section className="bg-[color:var(--ms-navy)] py-16 text-white sm:py-24">
      <MarketingContainer>
        <div className="grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          <SectionReveal>
            <SectionEyebrow className="text-[color:var(--ms-teal)]">
              MedSpace Clinical AI Assistant
            </SectionEyebrow>
            <MarketingHeading className="mt-3 text-white">
              AI drafts.
              <br />
              You decide what enters the record.
            </MarketingHeading>
            <p className="mt-5 max-w-md text-base leading-relaxed text-white/75">
              With patient consent, MedSpace can help structure consultation notes for clinician
              review.
            </p>
            <p className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--ms-teal)]">
              {STEPS.map((step) => (
                <span key={step}>{step}</span>
              ))}
            </p>
          </SectionReveal>
          <SectionReveal delayMs={80}>
            <div className="relative">
              <div className="pointer-events-none absolute -inset-6 rounded-full bg-[#2F63F5]/20 blur-3xl" />
              <div className="relative">
                <CopilotPreview />
              </div>
            </div>
          </SectionReveal>
        </div>
      </MarketingContainer>
    </section>
  );
}
