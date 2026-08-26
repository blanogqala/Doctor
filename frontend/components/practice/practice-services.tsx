'use client';

import { SectionReveal } from '@/components/marketing/section-reveal';
import type { LandingServiceItem } from '@/lib/tenant';
import {
  DEFAULT_LANDING_SERVICES,
  DEFAULT_SERVICES_INTRO,
  parseLandingServices,
  serviceIcon,
} from './practice-defaults';

export function PracticeServices({
  services,
  intro,
}: {
  services?: LandingServiceItem[] | null;
  intro?: string | null;
}) {
  const items = parseLandingServices(services) ?? DEFAULT_LANDING_SERVICES;
  const subtitle = intro?.trim() || DEFAULT_SERVICES_INTRO;

  return (
    <section id="services" className="scroll-mt-16 bg-slate-50 py-16 sm:py-20 border-b-2 border-primary">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionReveal>
          <h2 className="text-center text-3xl font-bold text-slate-900">Our Services</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-base font-medium text-primary">{subtitle}</p>
        </SectionReveal>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((service, i) => {
            const Icon = serviceIcon(service.icon);
            return (
              <SectionReveal key={`${service.title}-${i}`} delayMs={i * 60}>
                <article className="group h-full min-w-0 rounded-xl border-2 border-primary bg-gradient-to-br from-primary/10 via-slate-50 to-primary/5 p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-primary/90 group-hover:bg-primary/30">
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">{service.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{service.description}</p>
                </article>
              </SectionReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
