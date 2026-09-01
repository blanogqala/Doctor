'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { PLATFORM_DOMAIN } from '@/lib/marketing/constants';
import { SectionReveal } from './section-reveal';
import { MarketingContainer } from './marketing-container';
import { MarketingHeading } from './marketing-heading';

export const MARKETING_FAQS = [
  {
    question: 'What is MediNathi?',
    answer:
      'MediNathi is a modern practice workspace that connects appointments, patient folders, clinical documentation, reception workflows and patient access.',
  },
  {
    question: 'Who is MediNathi built for?',
    answer:
      'Independent doctors and growing medical practices that need a shared workspace for clinicians, reception and patients.',
  },
  {
    question: 'Can reception manage appointments?',
    answer:
      'Yes. Reception can book visits, create patient records during booking, manage arrivals and handle administrative updates — without access to the clinical chart.',
  },
  {
    question: 'Can patients use MediNathi?',
    answer:
      'Yes. Patients can book appointments and use the practice portal for the services that practice makes available, such as messages, records and payments.',
  },
  {
    question: 'Does MediNathi support AI-assisted clinical notes?',
    answer:
      'Yes. With patient consent, MediNathi can transcribe a consultation and propose a structured draft. The doctor reviews and decides what is saved.',
  },
  {
    question: 'Does AI replace the doctor’s clinical judgement?',
    answer:
      'No. AI can draft. It does not diagnose, choose treatment, or finalise the clinical record. The clinician stays in control.',
  },
  {
    question: 'Can my practice use its own branding?',
    answer: `Yes. Practices can set their name, logo and brand colour on a branded subdomain (for example your-practice.${PLATFORM_DOMAIN}).`,
  },
  {
    question: 'What happens during the trial?',
    answer:
      'New practices start with a 14-day trial of the MediNathi workspace so you can explore the workflow with your team in mind. There are no setup fees.',
  },
  {
    question: 'How does pricing work?',
    answer:
      'Plans are based on practice size (1, 3, 5, or 6+ configured doctors). All plans include the same core workspace. Enterprise pricing is arranged for configured seat counts.',
  },
  {
    question: 'Can I add more doctors later?',
    answer:
      'Yes. Move to a larger plan as your team grows. Enterprise covers 6 or more configured doctors.',
  },
  {
    question: 'How does MediNathi handle role-based access?',
    answer:
      'Doctor, reception and patient roles have separate workspaces. Practice data is isolated from other practices, and audit logs record sensitive actions.',
  },
  {
    question: 'How do I request a demo?',
    answer:
      'Use the contact form to tell us how your practice works today. You can also start from a pricing plan so we know the team size you have in mind.',
  },
];

export function FaqSection({ questions }: { questions?: string[] }) {
  const items = questions
    ? MARKETING_FAQS.filter((faq) => questions.includes(faq.question))
    : MARKETING_FAQS;
  return (
    <section id="faq" className="bg-white py-16 sm:py-20">
      <MarketingContainer className="max-w-3xl">
        <SectionReveal>
          <MarketingHeading className="text-center">Frequently asked questions</MarketingHeading>
        </SectionReveal>
        <SectionReveal delayMs={80}>
          <Accordion type="single" collapsible className="mt-10">
            {items.map((faq, i) => (
              <AccordionItem key={faq.question} value={`item-${i}`}>
                <AccordionTrigger className="text-left text-base font-semibold hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-[color:var(--ms-muted)]">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </SectionReveal>
      </MarketingContainer>
    </section>
  );
}
