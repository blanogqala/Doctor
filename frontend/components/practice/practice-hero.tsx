'use client';

import Link from 'next/link';
import { CheckCircle2, ChevronLeft, ChevronRight, MapPin, Phone, Stethoscope, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { absoluteApiUrl, type PracticeInfo } from '@/lib/tenant';
import { phoneToTelHref } from './practice-defaults';
import { useDoctorSlide } from './use-doctor-slide';

interface PracticeHeroProps {
  practice: PracticeInfo;
  logoSrc: string | null;
  bookHref: string;
  isLoggedIn: boolean;
  hasSlots: boolean;
  bookingAvailable?: boolean;
}

export function PracticeHero({
  practice,
  logoSrc,
  bookHref,
  isLoggedIn,
  hasSlots,
  bookingAvailable = true,
}: PracticeHeroProps) {
  const { doctor, goPrev, goNext, showControls } = useDoctorSlide(practice.doctors);
  const photoSrc = absoluteApiUrl(doctor?.photo_url);
  const tel = phoneToTelHref(practice.phone);
  const locationLabel = [practice.city, practice.province].filter(Boolean).join(', ');

  return (
    <section
      id="top"
      className="relative overflow-hidden bg-gradient-to-t from-primary/40 via-slate-50/50 to-primary/30 scroll-mt-16 border-b-2 border-primary"
    >
      <div className="pointer-events-none absolute inset-0 text-primary opacity-[0.13]">
        <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <defs>
            <pattern
              id="practice-hero-cross"
              width="60"
              height="60"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M0 30h18M24 30h12M42 30h18M30 0v18M30 24v12M30 42v18"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#practice-hero-cross)" />
        </svg>
      </div>
      <div className="relative mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 sm:py-12 lg:grid-cols-2 lg:items-center lg:gap-12 lg:py-14">
        <div className="min-w-0 ">
          <div className="mb-4 flex items-center gap-3">
            {logoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoSrc} alt="" className="h-12 w-12 object-contain sm:h-14 sm:w-14" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary shadow-sm sm:h-14 sm:w-14">
                <Stethoscope className="h-6 w-6 text-white sm:h-7 sm:w-7" />
              </div>
            )}
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-[42px] sm:leading-tight">
            {practice.clinic_name}
          </h1>
          {doctor && (
            <p className="mt-2 text-lg text-slate-600 sm:text-xl">
              {doctor.full_name}
              {doctor.specialization ? ` — ${doctor.specialization}` : ''}
            </p>
          )}
          <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
            {practice.tagline ||
              'Quality healthcare for the whole family. Book online in 2 minutes.'}
          </p>

          <ul className="mt-6 space-y-2">
            {doctor?.is_verified && (
              <li className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                HPCSA Registered
                {doctor.hpcsa_registration_number
                  ? ` (${doctor.hpcsa_registration_number})`
                  : ''}
              </li>
            )}
            <li className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
              Privacy-focused access controls
            </li>
            <li className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
              Telemedicine Available
            </li>
          </ul>

          <div className="mt-8 flex flex-wrap gap-3">
            {bookingAvailable ? (
              <Button
                asChild
                size="lg"
                className="min-h-12 bg-primary px-8 text-base font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <Link href={bookHref}>
                  {isLoggedIn ? 'Go to Dashboard' : 'Book Appointment'}
                </Link>
              </Button>
            ) : (
              <p className="max-w-md rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Online booking is temporarily unavailable. Please contact the Practice directly.
              </p>
            )}
            {tel && practice.phone && (
              <Button asChild size="lg" variant="outline" className="min-h-12 px-6 text-base border-primary">
                <a href={tel}>
                  <Phone className="mr-2 h-4 w-4" />
                  <span className="sm:hidden">Call</span>
                  <span className="hidden sm:inline">Call Practice: {practice.phone}</span>
                </a>
              </Button>
            )}
          </div>
        </div>

        <div className="relative mx-auto w-full min-w-0 max-w-md lg:mx-0 lg:justify-self-end">
          <div className="relative overflow-hidden rounded-2xl bg-white shadow-lg shadow-slate-200/80 ring-1 ring-slate-100">
            {photoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoSrc}
                alt={doctor?.full_name || 'Doctor'}
                className="h-[360px] w-full object-cover sm:h-[400px]"
              />
            ) : (
              <div className="flex h-[360px] w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-primary to-primary/80 text-white sm:h-[400px]">
                <Stethoscope className="h-14 w-14 opacity-90 sm:h-16 sm:w-16" />
                <p className="text-lg font-semibold">{doctor?.full_name || 'Your doctor'}</p>
              </div>
            )}

            {showControls && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute left-3 top-1/2 z-10 h-9 w-9 -translate-y-1/2 rounded-full bg-white/95 shadow-md"
                  onClick={goPrev}
                  aria-label="Previous doctor"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute right-3 top-1/2 z-10 h-9 w-9 -translate-y-1/2 rounded-full bg-white/95 shadow-md"
                  onClick={goNext}
                  aria-label="Next doctor"
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </>
            )}

            <div className="absolute inset-x-3 bottom-3 rounded-xl border border-slate-100 bg-white/95 p-3 shadow-md backdrop-blur-sm sm:inset-x-4 sm:bottom-4 sm:p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <span
                  className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
                    bookingAvailable && hasSlots ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                />
                {!bookingAvailable
                  ? 'Online booking unavailable'
                  : hasSlots
                    ? 'Available for appointments'
                    : 'Check booking calendar'}
              </div>
              <div className="mt-2 space-y-1.5 text-xs text-slate-500">
                <p className="flex items-center gap-1.5">
                  <Star className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                  Trusted by local families
                </p>
                {locationLabel && (
                  <p className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
                    {locationLabel}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
