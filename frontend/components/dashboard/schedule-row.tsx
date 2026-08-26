import Link from 'next/link';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/format';
import { AppointmentStatusBadge, AppointmentTypeBadge } from '@/components/shared/badges';
import type { Appointment, AppointmentStatus } from '@/lib/types';
import { isActiveConsult, isTerminal } from '@/lib/appointments/status';

export type ScheduleTone = 'past' | 'current' | 'upcoming';

export function scheduleTone(appt: Appointment, now: Date = new Date()): ScheduleTone {
  if (isActiveConsult(appt.status)) return 'current';
  if (isTerminal(appt.status)) return 'past';
  const scheduled = new Date(appt.scheduled_at);
  if (scheduled.getTime() < now.getTime()) return 'past';
  return 'upcoming';
}

interface ScheduleRowProps {
  appointment: Appointment;
  /** Primary identity line (patient or doctor name) */
  primary: string;
  secondary?: string;
  href?: string;
  actions?: React.ReactNode;
  showType?: boolean;
  className?: string;
  now?: Date;
}

export function ScheduleRow({
  appointment,
  primary,
  secondary,
  href,
  actions,
  showType = true,
  className,
  now = new Date(),
}: ScheduleRowProps) {
  const tone = scheduleTone(appointment, now);
  const content = (
    <>
      <div
        className={cn(
          'col-start-1 row-start-1 flex w-14 shrink-0 flex-col items-center justify-center rounded-lg px-2 py-2',
          tone === 'current' && 'bg-primary text-primary-foreground',
          tone === 'upcoming' && 'bg-primary-soft text-primary',
          tone === 'past' && 'bg-muted text-muted-foreground'
        )}
      >
        <span className="text-sm font-bold tabular-nums">{formatTime(appointment.scheduled_at)}</span>
      </div>
      <div className="col-start-2 row-start-1 min-w-0">
        <p className="truncate font-medium text-foreground">{primary}</p>
        {secondary && (
          <p className="truncate text-sm text-muted-foreground">{secondary}</p>
        )}
      </div>
      <div
        className={cn(
          'col-span-2 row-start-2 flex flex-wrap items-center gap-1 sm:col-span-1 sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:flex-col sm:items-end sm:justify-center'
        )}
      >
        <AppointmentStatusBadge status={appointment.status as AppointmentStatus} />
        {showType && <AppointmentTypeBadge type={appointment.type} />}
      </div>
      {actions && (
        <div className="col-span-2 row-start-3 flex flex-wrap items-center gap-1 sm:col-span-1 sm:col-start-4 sm:row-start-1">
          {actions}
        </div>
      )}
    </>
  );

  const rowClass = cn(
    'dashboard-item grid max-w-full grid-cols-[3.5rem_1fr] gap-x-3 gap-y-2 rounded-xl border p-3 sm:grid-cols-[3.5rem_1fr_auto]',
    actions && 'sm:grid-cols-[3.5rem_1fr_auto_auto]',
    tone === 'current' && 'border-primary/30 bg-primary-soft/30',
    tone === 'past' && 'opacity-70',
    className
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(rowClass, 'min-w-0 transition-colors hover:border-primary/40 hover:bg-muted/40')}
      >
        {content}
      </Link>
    );
  }

  return <div className={rowClass}>{content}</div>;
}
