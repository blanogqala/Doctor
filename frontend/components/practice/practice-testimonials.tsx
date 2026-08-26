'use client';

import { Quote } from 'lucide-react';
import { SectionReveal } from '@/components/marketing/section-reveal';
import { DEFAULT_TESTIMONIALS } from './practice-defaults';

export function PracticeTestimonials() {
  return (
    <section className="bg-slate-50 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionReveal>
          <h2 className="text-center text-3xl font-bold text-slate-900">What Patients Say</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-slate-600">
            Real experiences from families in our community.
          </p>
        </SectionReveal>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {DEFAULT_TESTIMONIALS.map((t, i) => (
            <SectionReveal key={t.name} delayMs={i * 70}>
              <blockquote className="flex h-full min-w-0 flex-col rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
                <Quote className="h-6 w-6 text-primary" />
                <p className="mt-4 flex-1 text-sm italic leading-relaxed text-slate-600">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <footer className="mt-5">
                  <cite className="not-italic text-sm font-bold text-slate-900">{t.name}</cite>
                  <p className="text-xs text-slate-500">{t.location}</p>
                </footer>
              </blockquote>
            </SectionReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
