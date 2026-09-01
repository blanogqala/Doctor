import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { demoHref, trialHref } from '@/lib/marketing/routes';
import { MarketingContainer } from './marketing-container';
import { SectionEyebrow } from './section-eyebrow';
import { MarketingHeading } from './marketing-heading';
import { SectionReveal } from './section-reveal';
import { CopilotPreview, DoctorDashboardPreview, PatientFolderPreview } from './product-previews';

export function HeroSection() {
  return (
    <section className="ms-bg-hero relative overflow-hidden pb-20 pt-14 sm:pb-28 sm:pt-20 border-b-2 border-b-[#12A89D]">
      <MarketingContainer>
        <div className="grid items-center gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-10">
          <SectionReveal>
            <SectionEyebrow>Modern practice software</SectionEyebrow>
            <MarketingHeading as="h1" className="mt-4 max-w-xl">
              More time with patients.
              <br />
              Less work around the consultation.
            </MarketingHeading>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-slate-600">
              Appointments, clinical notes, reception and patient access — connected in one modern
              practice workspace.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
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
            <p className="mt-4 text-sm text-slate-500">14-day trial · No setup fees</p>
          </SectionReveal>

          <SectionReveal delayMs={80} className="relative">
            <div className="pointer-events-none absolute -right-8 -top-10 h-56 w-56 rounded-full bg-[#2F63F5]/60 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-8 left-4 h-40 w-40 rounded-full bg-[#12A89D]/60 blur-3xl" />
            <div className="relative">
              <DoctorDashboardPreview />
              <div className="mt-4 grid gap-4 sm:hidden">
                <PatientFolderPreview />
              </div>
              <div className="pointer-events-none absolute -bottom-10 -left-6 hidden w-[46%] sm:block">
                <div className="origin-bottom-left scale-[0.92] drop-shadow-xl">
                  <PatientFolderPreview />
                </div>
              </div>
              <div className="pointer-events-none absolute -right-4 -top-8 hidden w-[42%] lg:block">
                <div className="origin-top-right scale-[0.88] drop-shadow-xl">
                  <CopilotPreview />
                </div>
              </div>
            </div>
            <div className="hidden h-16 sm:block lg:h-8" />
          </SectionReveal>
        </div>
      </MarketingContainer>
    </section>
  );
}
