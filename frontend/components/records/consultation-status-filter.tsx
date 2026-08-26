'use client';

import { cn } from '@/lib/utils';

export type ConsultationStatusFilterValue = 'all' | 'draft' | 'finalized';

const FILTER_OPTIONS: ReadonlyArray<{ value: ConsultationStatusFilterValue; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'finalized', label: 'Finalized' },
];

interface ConsultationStatusFilterProps {
  value: ConsultationStatusFilterValue;
  onChange: (value: ConsultationStatusFilterValue) => void;
  className?: string;
}

/** Secondary filter control — visually subordinate to Patient Folder section tabs. */
export function ConsultationStatusFilter({
  value,
  onChange,
  className,
}: ConsultationStatusFilterProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)} role="group" aria-label="Consultation status filter">
      <span className="text-caption text-muted-foreground">Filter:</span>
      <div className="inline-flex flex-wrap gap-1 rounded-lg bg-muted/30 p-0.5">
        {FILTER_OPTIONS.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={cn(
                'inline-flex h-8 items-center rounded-md px-2.5 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                active
                  ? 'border border-border/60 bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
              )}
              aria-pressed={active}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
