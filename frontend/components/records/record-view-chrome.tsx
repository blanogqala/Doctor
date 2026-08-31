'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface RecordViewChromeProps {
  title: string;
  subtitle?: string | null;
  actions?: ReactNode;
  tabs?: ReactNode;
  className?: string;
}

/**
 * Full-bleed sticky chrome: identity + actions + tabs in one container.
 * Cancels DashboardLayout main padding so it sits flush at the top.
 */
export function RecordViewChrome({
  title,
  subtitle,
  actions,
  tabs,
  className,
}: RecordViewChromeProps) {
  return (
    <div
      className={cn(
        'sticky top-16 z-30 -mx-4 -mt-4 border-b-2 border-primary bg-primary-soft shadow-md sm:-mx-6 sm:-mt-6 lg:top-0 lg:-mx-8 lg:-mt-8',
        'print:static print:shadow-none',
        className
      )}
    >
      <div className="px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-slate-900 sm:text-xl">{title}</p>
            {subtitle ? (
              <p className="mt-0.5 truncate text-sm text-slate-500">{subtitle}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center justify-end gap-2 sm:flex-nowrap">
              {actions}
            </div>
          ) : null}
        </div>
        {tabs ? (
          <div className="mt-3 rounded-lg border border-primary-soft bg-primary/30">{tabs}</div>
        ) : null}
      </div>
    </div>
  );
}
