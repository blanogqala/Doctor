'use client';

import {
  Palette,
  ShieldCheck,
  Video,
  ClipboardList,
  WifiOff,
  Sparkles,
} from 'lucide-react';
import { SectionReveal } from './section-reveal';
import { cn } from '@/lib/utils';

const features = [
  {
    icon: Palette,
    title: 'White-Label Branding',
    description: 'Your logo, your colors, your domain — a portal that looks like your practice.',
  },
  {
    icon: ShieldCheck,
    title: 'Privacy-Focused Access Controls',
    description:
      'Audit trails, encryption, and controls built with South African healthcare privacy requirements in mind.',
  },
  {
    icon: Video,
    title: 'Telemedicine Ready',
    description: 'Video consultations with consent workflows and secure patient records.',
  },
  {
    icon: ClipboardList,
    title: 'Patient Management',
    description: 'Appointments, records, and prescriptions in one place — no more paper chaos.',
  },
  {
    icon: WifiOff,
    title: 'Works Offline',
    description: 'PWA technology for load shedding resilience — keep working when the power drops.',
  },
  {
    icon: Sparkles,
    title: 'Zero Setup Cost',
    description: 'Start with a 14-day free trial. Plans from R800/month — no upfront fees.',
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="bg-slate-50 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionReveal>
          <div className="text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-slate-800 sm:text-4xl">
              Everything Your Practice Needs
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base text-slate-500 sm:text-lg">
              Built for South African doctors — privacy-minded, resilient, and ready on day one.
            </p>
          </div>
        </SectionReveal>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <SectionReveal key={f.title} delayMs={i * 60}>
              <div
                className={cn(
                  'group h-full rounded-2xl border border-transparent bg-white p-7 shadow-md shadow-slate-200/60',
                  'transition-all duration-300 hover:-translate-y-1 hover:border-secondary hover:shadow-lg'
                )}
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-white transition-colors group-hover:bg-primary">
                  <f.icon className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-medium text-slate-800">{f.title}</h3>
                <p className="mt-2 text-base leading-relaxed text-slate-500">{f.description}</p>
              </div>
            </SectionReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
