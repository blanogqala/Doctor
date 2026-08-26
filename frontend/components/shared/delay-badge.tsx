'use client';

import { formatTime, estimatedStart } from '@/lib/format';
import { cn } from '@/lib/utils';

export function DelayBadge({
  scheduledAt,
  delayMinutes,
  className,
}: {
  scheduledAt: string;
  delayMinutes?: number | null;
  className?: string;
}) {
  const delay = delayMinutes ?? 0;
  if (delay <= 0) return null;
  const eta = estimatedStart(scheduledAt, delay);
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800',
        className
      )}
    >
      Delayed +{delay} min · ETA {formatTime(eta)}
    </span>
  );
}
