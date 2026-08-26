'use client';

import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { maskIdNumber } from '@/lib/format';

interface RecordStickyHeaderProps {
  onBack: () => void;
  backLabel?: string;
  patientName: string;
  idNumber?: string | null;
  gender?: string | null;
  /** When set, replaces the masked ID / gender subtext line. */
  subtitle?: string | null;
  actions?: ReactNode;
  /** Sub-tabs rendered inside the same sticky container as the patient row. */
  tabs?: ReactNode;
  className?: string;
}

export function RecordStickyHeader({
  onBack,
  backLabel = 'Back',
  patientName,
  idNumber,
  gender,
  subtitle,
  actions,
  tabs,
  className,
}: RecordStickyHeaderProps) {
  const genderLabel = gender
    ? gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase()
    : null;

  const subtext =
    subtitle !== undefined && subtitle !== null
      ? subtitle
      : `${maskIdNumber(idNumber ?? null) ?? '—'}${genderLabel ? ` • ${genderLabel}` : ''}`;

  return (
    <header
      className={cn(
        'sticky top-16 z-30 -mx-4 -mt-4 border-b bg-white shadow-md sm:-mx-6 sm:-mt-6 lg:top-0 lg:-mx-8 lg:-mt-8',
        'print:static print:shadow-none',
        className
      )}
    >
      <div className="px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="h-9 w-9 flex-shrink-0"
              aria-label={backLabel}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <p className="truncate text-lg font-bold text-slate-900 sm:text-xl">{patientName}</p>
              {subtext ? (
                <p className="truncate text-sm text-slate-500">{subtext}</p>
              ) : null}
            </div>
          </div>
          {actions && (
            <div className="flex flex-wrap items-center justify-end gap-2 sm:flex-nowrap">
              {actions}
            </div>
          )}
        </div>
        {tabs ? <div className="mt-3">{tabs}</div> : null}
      </div>
    </header>
  );
}
