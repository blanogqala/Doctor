'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { SectionReveal } from '@/components/marketing/section-reveal';
import { buildDefaultFaqs } from './practice-defaults';

interface PracticeFaqProps {
  emergencyPhone?: string | null;
}

export function PracticeFaq({ emergencyPhone }: PracticeFaqProps) {
  const faqs = buildDefaultFaqs(emergencyPhone);

  return (
    <section id="faq" className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <SectionReveal>
          <h2 className="text-center text-3xl font-bold text-slate-900">Frequently Asked Questions</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-slate-600">
            Quick answers before you book.
          </p>
        </SectionReveal>

        <SectionReveal delayMs={60}>
          <Accordion type="single" collapsible className="mt-10">
            {faqs.map((faq, i) => (
              <AccordionItem key={faq.question} value={`item-${i}`}>
                <AccordionTrigger className="text-left text-base font-semibold text-slate-900">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-slate-600">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </SectionReveal>
      </div>
    </section>
  );
}
