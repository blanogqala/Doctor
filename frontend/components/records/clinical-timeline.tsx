'use client';

import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import type { ClinicalTimelineEvent, ClinicalTimelineKind } from '@/lib/clinical/patient-folder';
import { StatusBadge } from '@/components/ds/status-badge';
import {
  Calendar,
  FilePenLine,
  FileText,
  Pill,
  Stethoscope,
  ArrowRightLeft,
} from 'lucide-react';

const kindIcon: Record<ClinicalTimelineKind, React.ReactNode> = {
  consultation: <Stethoscope className="h-4 w-4" aria-hidden />,
  follow_up: <FileText className="h-4 w-4" aria-hidden />,
  prescription: <Pill className="h-4 w-4" aria-hidden />,
  referral: <ArrowRightLeft className="h-4 w-4" aria-hidden />,
  amendment: <FilePenLine className="h-4 w-4" aria-hidden />,
  appointment: <Calendar className="h-4 w-4" aria-hidden />,
};

export function ClinicalTimelineItem({
  event,
  onOpen,
}: {
  event: ClinicalTimelineEvent;
  onOpen?: (event: ClinicalTimelineEvent) => void;
}) {
  const interactive = Boolean(event.href || onOpen);
  const content = (
    <>
      <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary-soft text-primary">
        {kindIcon[event.kind]}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <time className="text-sm font-semibold text-foreground" dateTime={event.date}>
            {formatDate(event.date, true)}
          </time>
          {event.statusLabel && (
            <StatusBadge
              tone={
                event.statusLabel === 'Draft'
                  ? 'warning'
                  : event.statusLabel === 'Finalized'
                    ? 'success'
                    : event.statusLabel === 'Erroneous'
                      ? 'danger'
                      : 'neutral'
              }
              label={event.statusLabel}
              className="normal-case"
            />
          )}
        </div>
        <p className="mt-0.5 text-sm font-medium text-foreground">{event.title}</p>
        {event.subtitle && (
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{event.subtitle}</p>
        )}
      </div>
    </>
  );

  if (!interactive) {
    return (
      <li className="flex gap-3 py-3">
        {content}
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen?.(event)}
        className={cn(
          'flex w-full gap-3 rounded-lg py-3 text-left transition-colors',
          'hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        )}
        aria-label={`Open ${event.title} from ${formatDate(event.date)}`}
      >
        {content}
      </button>
    </li>
  );
}

export function ClinicalTimeline({
  events,
  onOpen,
  empty,
  className,
}: {
  events: ClinicalTimelineEvent[];
  onOpen?: (event: ClinicalTimelineEvent) => void;
  empty?: React.ReactNode;
  className?: string;
}) {
  if (events.length === 0) {
    return <>{empty ?? null}</>;
  }

  return (
    <ol className={cn('divide-y divide-border', className)} aria-label="Clinical timeline">
      {events.map((event) => (
        <ClinicalTimelineItem key={event.id} event={event} onOpen={onOpen} />
      ))}
    </ol>
  );
}
