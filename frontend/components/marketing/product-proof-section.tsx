import { CalendarDays, FolderOpen, Users } from 'lucide-react';
import { MarketingContainer } from './marketing-container';
import { MarketingHeading } from './marketing-heading';
import { SectionReveal } from './section-reveal';

const BENEFITS = [
  {
    icon: CalendarDays,
    title: 'Run the practice',
    copy: 'Appointments, reception and patient flow.',
  },
  {
    icon: FolderOpen,
    title: 'Document care',
    copy: 'Patient folders and AI-assisted clinical notes.',
  },
  {
    icon: Users,
    title: 'Keep patients connected',
    copy: 'Portal, messaging and virtual care.',
  },
];

export function ProductProofSection() {
  return (
    <section className="ms-bg-white py-16 sm:py-20">
      <MarketingContainer>
        <SectionReveal>
          <MarketingHeading className="max-w-xl">
            Everything around the consultation, connected.
          </MarketingHeading>
        </SectionReveal>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {BENEFITS.map((item, i) => (
            <SectionReveal key={item.title} delayMs={i * 50}>
              <div className="h-full rounded-2xl border border-[#12A89D] bg-gradient-to-b from-[color:var(--ms-canvas)] to-[#2F63F5]/20 p-6">
                <item.icon className="h-5 w-5 text-[#2F63F5]" aria-hidden />
                <h3 className="mt-4 text-sm font-semibold uppercase tracking-[0.12em] text-[#12A89D]">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm text-slate-600">{item.copy}</p>
              </div>
            </SectionReveal>
          ))}
        </div>
      </MarketingContainer>
    </section>
  );
}
