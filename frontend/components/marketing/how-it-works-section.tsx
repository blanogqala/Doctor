'use client';

import { Monitor, Stethoscope, Shield } from 'lucide-react';
import { PLATFORM_DOMAIN } from '@/lib/marketing/constants';
import { SectionReveal } from './section-reveal';

const steps = [
  {
    icon: Monitor,
    number: '01',
    title: 'We Create Your Portal',
    description: `You get a custom subdomain: dr-ndamase.${PLATFORM_DOMAIN}. Upload your logo, set your colors, and configure consultation fees.`,
  },
  {
    icon: Stethoscope,
    number: '02',
    title: 'You See Patients',
    description:
      'Patients book directly through your branded link. Conduct telemedicine consultations and manage records securely.',
  },
  {
    icon: Shield,
    number: '03',
    title: 'We Handle the Tech',
    description:
      'Automatic backups, privacy-focused access controls, and SSL security. You focus on medicine — we focus on technology.',
  },
];

export function HowItWorksSection() {
  return (
    <section className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionReveal>
          <div className="text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-slate-800 sm:text-4xl">
              How MedSpace Works
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base text-slate-500 sm:text-lg">
              From signup to seeing your first patient — in three simple steps.
            </p>
          </div>
        </SectionReveal>

        <div className="relative mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
          {/* Connecting line (desktop) */}
          <div
            className="pointer-events-none absolute left-[16%] right-[16%] top-10 hidden h-0.5 bg-gradient-to-r from-secondary/20 via-secondary/60 to-secondary/20 md:block"
            aria-hidden
          />

          {steps.map((step, i) => (
            <SectionReveal key={step.title} delayMs={i * 80}>
              <div className="group relative text-center transition-transform duration-300 hover:-translate-y-1.5">
                <div className="relative z-10 mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-secondary text-white shadow-md shadow-secondary/25 transition-shadow group-hover:shadow-lg group-hover:shadow-secondary/30">
                  <span className="text-xl font-bold tracking-tight">{step.number}</span>
                </div>
                <div className="mx-auto mt-5 flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
                  <step.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-xl font-semibold text-slate-800">{step.title}</h3>
                <p className="mx-auto mt-2 max-w-[300px] text-base leading-relaxed text-slate-500">
                  {step.description}
                </p>
              </div>
            </SectionReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
