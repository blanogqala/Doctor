'use client';

import { MarketingContainer } from './marketing-container';
import { MarketingHeading } from './marketing-heading';
import { SectionEyebrow } from './section-eyebrow';
import { SectionReveal } from './section-reveal';
import {
  BrandingPreview,
  CopilotPreview,
  DoctorDashboardPreview,
  PatientFolderPreview,
} from './product-previews';

const PILLARS = [
  {
    id: 'practice',
    title: 'Practice',
    copy: 'Appointments, reception and patient flow stay in one operational workspace.',
    chips: ['Appointments', 'Reception', 'Patient flow'],
    visual: <DoctorDashboardPreview />,
  },
  {
    id: 'clinical',
    title: 'Clinical',
    copy: 'Keep consultations, follow-ups and records in one patient folder.',
    chips: ['Patient Folder', 'Clinical records', 'Follow-ups'],
    visual: <PatientFolderPreview />,
    reverse: true,
  },
  {
    id: 'ai',
    title: 'AI',
    copy: 'With consent, MediNathi can draft structured notes for clinician review.',
    chips: ['Transcription', 'Structured drafts', 'Clinician review'],
    visual: <CopilotPreview />,
  },
  {
    id: 'patients',
    title: 'Patient',
    copy: 'Patients use the branded portal for the services their practice enables.',
    chips: ['Portal', 'Messaging', 'Telemedicine'],
    visual: <BrandingPreview />,
    reverse: true,
  },
];

export function FeaturesPageContent() {
  return (
    <>
      <section className="ms-bg-hero pb-8 pt-16 sm:pt-20 border-b-2 border-b-[#12A89D]">
        <MarketingContainer>
          <SectionReveal>
            <SectionEyebrow>Features</SectionEyebrow>
            <MarketingHeading as="h1" className="mt-4 max-w-2xl">
              Everything your practice needs to stay connected.
            </MarketingHeading>
          </SectionReveal>
        </MarketingContainer>
      </section>

      {PILLARS.map((pillar, i) => (
        <section
          key={pillar.id}
          id={pillar.id}
          className={i % 2 === 0 ? 'ms-bg-white py-14 sm:py-20' : 'ms-bg-tint py-14 sm:py-20'}
        >
          <MarketingContainer>
            <div className="grid items-center gap-10 lg:grid-cols-2">
              <div className={pillar.reverse ? 'lg:order-2' : ''}>
                <MarketingHeading as="h2">{pillar.title}</MarketingHeading>
                <p className="mt-4 max-w-md text-base text-slate-600">{pillar.copy}</p>
                <ul className="mt-5 flex flex-wrap gap-2">
                  {pillar.chips.map((chip) => (
                    <li
                      key={chip}
                      className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200"
                    >
                      {chip}
                    </li>
                  ))}
                </ul>
              </div>
              <div className={pillar.reverse ? 'lg:order-1' : ''}>{pillar.visual}</div>
            </div>
          </MarketingContainer>
        </section>
      ))}
    </>
  );
}
