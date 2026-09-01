import { MarketingContainer } from './marketing-container';
import { MarketingHeading } from './marketing-heading';
import { SectionReveal } from './section-reveal';
import { PatientFolderPreview, QueueCardPreview } from './product-previews';

export function PracticeSplitSection() {
  return (
    <section className="ms-bg-white py-16 sm:py-24">
      <MarketingContainer>
        <SectionReveal>
          <MarketingHeading>Built for the whole practice.</MarketingHeading>
        </SectionReveal>
        <div className="mt-12 grid gap-12 lg:grid-cols-2">
          <SectionReveal>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#12A89D]">Doctor</p>
            <p className="mt-3 text-base text-slate-600">
              See history, document consultations and manage follow-ups.
            </p>
            <div className="mt-6">
              <PatientFolderPreview />
            </div>
          </SectionReveal>
          <SectionReveal delayMs={80}>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#12A89D]">
              Reception
            </p>
            <p className="mt-3 text-base text-slate-600">
              Manage appointments and arrivals without opening the clinical chart.
            </p>
            <div className="mt-6">
              <QueueCardPreview />
            </div>
          </SectionReveal>
        </div>
      </MarketingContainer>
    </section>
  );
}
