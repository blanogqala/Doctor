'use client';

import Link from 'next/link';
import { Video, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionReveal } from '@/components/marketing/section-reveal';
import { formatCurrency } from '@/lib/format';
import type { PracticeDoctorSummary } from '@/lib/tenant';

interface PracticeFeesProps {
  doctor: PracticeDoctorSummary | undefined;
  bookHref: string;
}

export function PracticeFees({ doctor, bookHref }: PracticeFeesProps) {
  const inPerson = doctor?.consultation_fee_cents ?? 60000;
  const tele = doctor?.telemedicine_fee_cents ?? 45000;

  const cards = [
    {
      title: 'In-Person Consultation',
      fee: inPerson,
      icon: UserRound,
      points: ['30-minute appointment', 'Physical examination', 'Prescription & referral'],
      cta: 'Book In-Person',
    },
    {
      title: 'Telemedicine',
      fee: tele,
      icon: Video,
      points: ['20-minute video call', 'Prescription included', 'Follow-up included'],
      cta: 'Book Telemedicine',
    },
  ];

  return (
    <section id="fees" className="bg-slate-50 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionReveal>
          <h2 className="text-center text-3xl font-bold text-slate-900">Consultation Fees</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-slate-600">
            Transparent pricing with no surprises.
          </p>
        </SectionReveal>

        <div className="mx-auto mt-10 grid max-w-4xl gap-6 md:grid-cols-2">
          {cards.map((card, i) => (
            <SectionReveal key={card.title} delayMs={i * 80}>
              <article className="flex h-full min-w-0 flex-col rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <card.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">{card.title}</h3>
                <p className="mt-3 text-3xl font-bold text-slate-900">{formatCurrency(card.fee)}</p>
                <ul className="mt-5 flex-1 space-y-2">
                  {card.points.map((p) => (
                    <li key={p} className="text-sm text-slate-600">
                      · {p}
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  className="mt-6 min-h-11 w-full bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  <Link href={bookHref}>{card.cta}</Link>
                </Button>
              </article>
            </SectionReveal>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-slate-500">
          Medical aid accepted. Cash and card payments welcome.
        </p>
      </div>
    </section>
  );
}
