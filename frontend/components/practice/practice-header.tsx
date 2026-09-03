'use client';

import Link from 'next/link';
import { Menu, Phone, Stethoscope, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { PracticeInfo } from '@/lib/tenant';
import { phoneToTelHref } from './practice-defaults';
import { PracticeLogo } from '@/components/practice/practice-logo';

interface PracticeHeaderProps {
  practice: PracticeInfo;
  logoSrc: string | null;
  bookHref: string;
  isLoggedIn: boolean;
  bookingAvailable?: boolean;
}

export function PracticeHeader({
  practice,
  logoSrc,
  bookHref,
  isLoggedIn,
  bookingAvailable = true,
}: PracticeHeaderProps) {
  const [open, setOpen] = useState(false);
  const tel = phoneToTelHref(practice.phone);

  const nav = [
    { href: '#top', label: 'Home' },
    { href: '#services', label: 'Services' },
    { href: '#about', label: 'About' },
    { href: '#location', label: 'Contact' },
  ];

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b-2 border-primary bg-white/95 backdrop-blur">
      <div className="relative mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <a href="#top" className="flex min-w-0 shrink items-center gap-2.5 sm:gap-3">
          <PracticeLogo
            src={logoSrc}
            size="sm"
            className="h-9 w-9 sm:h-10 sm:w-10"
            fallbackClassName="h-9 w-9 rounded-xl sm:h-10 sm:w-10"
            fallbackIcon={Stethoscope}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900 sm:text-base">
              {practice.clinic_name}
            </p>
            {practice.doctors[0] && (
              <p className="hidden truncate text-xs text-slate-500 sm:block">
                {practice.doctors[0].full_name}
              </p>
            )}
          </div>
        </a>

        <nav className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-5 lg:flex">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="whitespace-nowrap text-sm font-medium text-slate-600 transition hover:text-primary"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {tel && (
            <Button asChild variant="outline" className="hidden min-h-10 xl:inline-flex">
              <a href={tel}>
                <Phone className="mr-2 h-4 w-4" />
                Call
              </a>
            </Button>
          )}
          {!isLoggedIn && (
            <Button asChild variant="ghost" className="hidden min-h-10 sm:inline-flex">
              <Link href="/login">Sign In</Link>
            </Button>
          )}
          {bookingAvailable || isLoggedIn ? (
            <Button
              asChild
              className="hidden min-h-10 bg-primary text-primary-foreground hover:bg-primary/90 sm:inline-flex"
            >
              <Link href={bookHref}>{isLoggedIn ? 'Dashboard' : 'Book Now'}</Link>
            </Button>
          ) : null}
          <button
            type="button"
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-slate-200 lg:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-slate-100 bg-white px-4 py-4 lg:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-3">
            {nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-2">
              {tel && (
                <Button asChild variant="outline" className="min-h-11 w-full">
                  <a href={tel}>Call Practice</a>
                </Button>
              )}
              {!isLoggedIn && (
                <Button asChild variant="outline" className="min-h-11 w-full">
                  <Link href="/login">Sign In</Link>
                </Button>
              )}
              {bookingAvailable || isLoggedIn ? (
                <Button
                  asChild
                  className="min-h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Link href={bookHref}>{isLoggedIn ? 'Go to Dashboard' : 'Book Appointment'}</Link>
                </Button>
              ) : (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Online booking is temporarily unavailable. Please contact the Practice directly.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
