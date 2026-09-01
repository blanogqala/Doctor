import { MarketingContainer } from './marketing-container';
import { MarketingHeading } from './marketing-heading';
import { SectionReveal } from './section-reveal';
import { DoctorDashboardPreview } from './product-previews';

const STEPS = ['Book', 'Arrive', 'Consult', 'Follow up'];

export function JourneySection() {
  return (
    <section className="ms-bg-tint py-16 sm:py-20">
      <MarketingContainer>
        <SectionReveal>
          <MarketingHeading>From booking to follow-up.</MarketingHeading>
        </SectionReveal>
        <ol className="mt-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-0">
          {STEPS.map((step, i) => (
            <li key={step} className="flex items-center lg:flex-1">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2F63F5] text-xs font-semibold text-white">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-sm font-semibold uppercase tracking-[0.14em]">{step}</span>
              </div>
              {i < STEPS.length - 1 && (
                <span className="mx-4 hidden h-px flex-1 bg-slate-300 lg:block" aria-hidden />
              )}
            </li>
          ))}
        </ol>
        <SectionReveal delayMs={80} className="mt-10">
          <DoctorDashboardPreview />
        </SectionReveal>
      </MarketingContainer>
    </section>
  );
}
