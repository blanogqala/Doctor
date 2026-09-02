'use client';

import Link from 'next/link';
import { ArrowLeft, HeartPulse } from 'lucide-react';
import { useTenant } from '@/lib/tenant';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageContainer, type PageContainerSize } from '@/components/layout/page-container';
import { cn } from '@/lib/utils';

interface AuthShellProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  cardTitle: string;
  cardDescription?: string;
  size?: Extract<PageContainerSize, 'sm' | 'md'>;
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
  const { practice } = useTenant();
  const clinicName = brandName ?? practice?.clinic_name;
  const showLandingBack = showBackLink;

  return (
    <PageContainer
      size={size}
      centered
      className="relative bg-gradient-to-br from-primary/5 via-background to-secondary/5 py-12"
    >
      {showLandingBack && (
        <div className="absolute left-4 top-4 z-10 sm:left-6 sm:top-6">
          <Link
            href="/"
            className={cn(
              buttonVariants({ variant: 'outline' }),
              'min-h-10 gap-2 bg-card/90 shadow-sm'
            )}
          >
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
            <span>Back to landing page</span>
          </Link>
        </div>
      )}

      <div className="mb-8 flex flex-col items-center pt-10 text-center sm:pt-0">
        <Link href="/" className="flex flex-col items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary shadow-sm">
            <HeartPulse className="h-7 w-7 text-primary-foreground" aria-hidden />
          </div>
          <span className="min-h-5 text-sm font-semibold text-foreground">
            {clinicName ?? '\u00a0'}
          </span>
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>

      <Card className="w-full border-border bg-card shadow-md">
        <CardHeader className="space-y-1.5 pb-4">
          <CardTitle className="text-xl">{cardTitle}</CardTitle>
          {cardDescription && <CardDescription>{cardDescription}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>

      {footer}
    </PageContainer>
  );
}
