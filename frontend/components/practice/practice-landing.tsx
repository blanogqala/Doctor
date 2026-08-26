'use client';

import { useEffect, useMemo, useState } from 'react';
import { HeartPulse } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useTenant } from '@/lib/tenant';
import { fetchNextSlots } from '@/lib/api/practice';
import { PracticeHeader } from './practice-header';
import { PracticeHero } from './practice-hero';
import { PracticeQuickBookBar } from './practice-quick-book-bar';
import { PracticeServices } from './practice-services';
import { PracticeAbout } from './practice-about';
import { PracticeFees } from './practice-fees';
import { PracticeLocation } from './practice-location';
import { PracticeTestimonials } from './practice-testimonials';
import { PracticeFaq } from './practice-faq';
import { PracticeFinalCta } from './practice-final-cta';
import { PracticeFooter } from './practice-footer';

export function PracticeLanding() {
  const { user } = useAuth();
  const { practice, logoSrc, loading, error, subdomain } = useTenant();
  const [slots, setSlots] = useState<Array<{ start: string; end: string }>>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const bookingAvailable = practice?.booking_available !== false;
  const bookHref = user ? '/dashboard' : '/register';
  const primaryDoctor = practice?.doctors[0];

  useEffect(() => {
    if (!practice) return;

    const doctorName = primaryDoctor?.full_name;
    const title = doctorName
      ? `${practice.clinic_name} | ${doctorName}`
      : practice.clinic_name;
    document.title = title;

    const description =
      practice.tagline ||
      `Book an appointment online with ${practice.clinic_name}. Quality healthcare for the whole family.`;

    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', description);
  }, [practice, primaryDoctor?.full_name]);

  useEffect(() => {
    if (!subdomain || !primaryDoctor?.id || !bookingAvailable) {
      setSlots([]);
      return;
    }

    let cancelled = false;
    setSlotsLoading(true);
    fetchNextSlots({ subdomain, doctorId: primaryDoctor.id, limit: 3 })
      .then((next) => {
        if (!cancelled) setSlots(next);
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [subdomain, primaryDoctor?.id, bookingAvailable]);

  const hasSlots = useMemo(() => slots.length > 0, [slots]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <HeartPulse className="h-8 w-8 animate-pulse text-primary" />
      </div>
    );
  }

  if (error || !practice) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Practice not found</h1>
        <p className="text-slate-600">{error || 'Check the subdomain and try again.'}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-white pb-24 pt-16 md:pb-0">
      <PracticeHeader
        practice={practice}
        logoSrc={logoSrc}
        bookHref={bookHref}
        isLoggedIn={!!user}
        bookingAvailable={bookingAvailable}
      />
      <main>
        <PracticeHero
          practice={practice}
          logoSrc={logoSrc}
          bookHref={bookHref}
          isLoggedIn={!!user}
          hasSlots={hasSlots}
          bookingAvailable={bookingAvailable}
        />
        <PracticeQuickBookBar
          slots={slots}
          bookHref={bookHref}
          loading={slotsLoading}
          bookingAvailable={bookingAvailable}
        />
        <PracticeServices
          services={practice.landing_services}
          intro={practice.services_intro}
        />
        <PracticeAbout doctors={practice.doctors} />
        {/* <PracticeFees doctor={primaryDoctor} bookHref={bookHref} /> */}
        <PracticeLocation practice={practice} />
        {/* <PracticeTestimonials /> */}
        {/* <PracticeFaq emergencyPhone={practice.emergency_phone} /> */}
        <PracticeFinalCta
          clinicName={practice.clinic_name}
          phone={practice.phone}
          bookHref={bookHref}
          isLoggedIn={!!user}
          bookingAvailable={bookingAvailable}
        />
      </main>
      <PracticeFooter practice={practice} logoSrc={logoSrc} />
    </div>
  );
}
