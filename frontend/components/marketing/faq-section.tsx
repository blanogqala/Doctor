'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { PLATFORM_DOMAIN } from '@/lib/marketing/constants';
import { SectionReveal } from './section-reveal';

const faqs = [
  {
    question: 'Do I need technical skills to use this?',
    answer:
      'No. We set everything up for you — your branded portal, user accounts, and patient booking link. You just log in and start seeing patients.',
  },
  {
    question: 'Can I use my own domain?',
    answer: `Every plan includes a branded subdomain (e.g. dr-yourname.${PLATFORM_DOMAIN}). Contact us if you need to discuss a custom domain for your practice.`,
  },
  {
    question: 'Is my patient data safe?',
    answer:
      'Yes. We use encryption, privacy-focused access controls, and audit trails. MedSpace is built with South African healthcare privacy requirements in mind.',
  },
  {
    question: 'What happens if I want to leave?',
    answer:
      'You can export all your data anytime. We do not lock you in — your patient records belong to your practice.',
  },
  {
    question: 'How do patients find my portal?',
    answer: `We give you a custom link (e.g. dr-ndamase.${PLATFORM_DOMAIN}) to share via WhatsApp, email, or QR code on your business cards.`,
  },
];

export function FaqSection() {
  return (
    <section id="faq" className="bg-slate-100 py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <SectionReveal>
          <h2 className="text-center text-3xl font-semibold tracking-tight text-slate-800 sm:text-4xl">
            Frequently Asked Questions
          </h2>
        </SectionReveal>

        <SectionReveal delayMs={80}>
          <Accordion type="single" collapsible className="mt-10">
            {faqs.map((faq, i) => (
              <AccordionItem
                key={faq.question}
                value={`item-${i}`}
                className="border-b border-l-4 border-l-transparent border-slate-200 transition-colors data-[state=open]:border-l-secondary data-[state=open]:bg-white"
              >
                <AccordionTrigger className="text-left text-lg font-semibold text-slate-800 hover:no-underline hover:text-secondary">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-base leading-relaxed text-slate-500">
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
