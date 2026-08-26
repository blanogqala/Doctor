'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { SectionReveal } from '@/components/marketing/section-reveal';
import { phoneToTelHref } from './practice-defaults';

interface PracticeFinalCtaProps {
  clinicName: string;
  phone?: string | null;
  bookHref: string;
  isLoggedIn: boolean;
  bookingAvailable?: boolean;
}

export function PracticeFinalCta({
  clinicName,
  phone,
  bookHref,
  isLoggedIn,
  bookingAvailable = true,
}: PracticeFinalCtaProps) {
  const tel = phoneToTelHref(phone);

  return (
    <section className="bg-primary py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <SectionReveal>
          <h2 className="text-3xl font-bold text-primary-foreground sm:text-4xl">
            {bookingAvailable ? 'Ready to Book Your Appointment?' : 'Contact the Practice'}
          </h2>
          <p className="mt-4 text-lg text-primary-foreground/90">
            {bookingAvailable
              ? `Join patients who trust ${clinicName}`
              : 'Online booking is temporarily unavailable. Please contact the Practice directly.'}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {bookingAvailable ? (
              <Button
                asChild
                size="lg"
                className="min-h-12 bg-white px-8 text-base font-semibold text-primary hover:bg-white/90"
              >
                <Link href={bookHref}>
                  {isLoggedIn ? 'Go to Dashboard' : 'Book Now — Next Available Today'}
                </Link>
              </Button>
            ) : null}
            {tel && phone && (
              <a
                href={tel}
                className="text-sm font-medium text-primary-foreground/95 underline-offset-4 hover:underline"
              >
                {bookingAvailable ? `Or call us: ${phone}` : `Call us: ${phone}`}
              </a>
            )}
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}
