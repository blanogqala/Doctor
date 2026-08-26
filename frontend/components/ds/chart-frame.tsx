'use client';

import * as React from 'react';
import * as RechartsPrimitive from 'recharts';
import { cn } from '@/lib/utils';

/**
 * Lightweight chart frame for Phase 2 foundation.
 * Ensures min-width 0, readable padding, and no page overflow.
 * Full themed ChartContainer from shadcn remains in ui/chart.tsx for advanced use.
 */
interface ChartFrameProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  description?: string;
  /** Aspect ratio utility, e.g. aspect-video */
  aspectClassName?: string;
}

export function ChartFrame({
  children,
  className,
  title,
  description,
  aspectClassName = 'aspect-[16/9] sm:aspect-[2/1]',
}: ChartFrameProps) {
  return (
    <figure className={cn('min-w-0 space-y-3', className)}>
      {(title || description) && (
        <figcaption className="space-y-0.5">
          {title && <p className="text-card-title">{title}</p>}
          {description && <p className="text-caption">{description}</p>}
        </figcaption>
      )}
      <div
        className={cn(
          'w-full min-w-0 overflow-hidden rounded-xl border border-border/70 bg-card p-3 sm:p-4',
          aspectClassName
        )}
      >
        <div className="h-full w-full min-w-0 [&_.recharts-responsive-container]:!h-full [&_.recharts-responsive-container]:!w-full">
          {children}
        </div>
      </div>
    </figure>
  );
}

export { RechartsPrimitive };
