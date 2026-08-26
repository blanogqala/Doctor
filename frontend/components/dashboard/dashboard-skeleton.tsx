import { Skeleton } from '@/components/ui/skeleton';
import { MetricGrid, type MetricGridColumns } from '@/components/ds/cards';
import { cn } from '@/lib/utils';

interface DashboardSkeletonProps {
  className?: string;
  rows?: number;
}

/** Layout-matched list skeleton for dashboard panels. */
export function DashboardListSkeleton({ className, rows = 4 }: DashboardSkeletonProps) {
  return (
    <div className={cn('space-y-3', className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-border/60 p-3">
          <Skeleton className="h-12 w-14 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function MetricGridSkeleton({
  count = 4,
  columns = 'default',
  className,
}: {
  count?: number;
  columns?: MetricGridColumns;
  className?: string;
}) {
  return (
    <div aria-busy="true" aria-label="Loading metrics">
      <MetricGrid columns={columns} className={className}>
        {Array.from({ length: count }).map((_, i) => (
          <Skeleton key={i} className="h-[7.5rem] rounded-xl" />
        ))}
      </MetricGrid>
    </div>
  );
}

export function HeroSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('space-y-4 rounded-xl border border-border/70 p-5', className)}
      aria-busy="true"
      aria-label="Loading"
    >
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-40" />
      <div className="flex gap-2 pt-2">
        <Skeleton className="h-10 w-36 rounded-lg" />
        <Skeleton className="h-10 w-28 rounded-lg" />
      </div>
    </div>
  );
}
