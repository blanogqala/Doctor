'use client';

import Link from 'next/link';
import { ArrowLeft, HeartPulse } from 'lucide-react';
import { useTenant } from '@/lib/tenant';
import { buttonVariants } from '@/components/ui/button';
import { PracticeAuthBackground } from '@/components/layout/practice-auth-background';
import { cn } from '@/lib/utils';

export type AuthShellSize = 'sm' | 'md';

const panelWidth: Record<AuthShellSize, string> = {
  sm: 'max-w-[560px]',
  md: 'max-w-[720px]',
};

interface AuthShellProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  cardTitle: string;
  cardDescription?: string;
  size?: AuthShellSize;
  footer?: React.ReactNode;
  showBackLink?: boolean;
  /** Overrides practice-hostname branding (e.g. canonical invite on the platform host). */
  brandName?: string;
}

export function AuthShell({
  children,
  title,
  subtitle,
  cardTitle,
  cardDescription,
  size = 'sm',
  footer,
  showBackLink = true,
  brandName,
}: AuthShellProps) {
  const { practice, logoSrc } = useTenant();
  const clinicName = brandName ?? practice?.clinic_name;

  return (
    <div className="relative min-h-screen w-full max-w-full overflow-x-hidden bg-card">
      <PracticeAuthBackground />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-5 py-20 sm:px-8 sm:py-16">
        <div
          className={cn(
            'relative w-full border-2 border-primary rounded-xl bg-card shadow-[0_20px_60px_-24px_rgba(15,23,42,0.45)]',
            panelWidth[size]
          )}
        >
          {/* Poster double rule: outer panel edge plus an inset hairline. */}
          <div
            className="pointer-events-none absolute inset-[7px] border-2 border-primary/80 rounded-xl bg-primary/20"
            aria-hidden
          />

          <div className="relative px-6 py-10 sm:px-10 sm:py-12">
            <div className="flex flex-col items-center text-center">
              <Link href="/" className="flex flex-col items-center gap-2">
                {logoSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoSrc} alt="" className="h-14 w-14 rounded-xl object-contain" />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary shadow-sm">
                    <HeartPulse className="h-7 w-7 text-primary-foreground" aria-hidden />
                  </div>
                )}
                <span className="min-h-5 text-sm font-semibold uppercase tracking-[0.14em] text-primary">
                  {clinicName ?? '\u00a0'}
                </span>
              </Link>
              <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {title}
              </h1>
              {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
            </div>

            <div className="my-8 h-px bg-primary" />

            <div className="space-y-1.5">
              <h2 className="text-lg font-semibold text-foreground">{cardTitle}</h2>
              {cardDescription && (
                <p className="text-sm text-muted-foreground">{cardDescription}</p>
              )}
            </div>

            <div className="mt-6">{children}</div>

            {footer}

            {showBackLink && (
              <div className="mt-8 flex justify-center">
                <Link
                  href="/"
                  className={cn(
                    buttonVariants({ variant: 'outline' }),
                    'min-h-10 gap-2 border-border bg-card shadow-sm'
                  )}
                >
                  <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
                  <span>Back to landing page</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
