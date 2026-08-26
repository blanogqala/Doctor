import { cn } from '@/lib/utils';
import { TableScroll } from '@/components/ds/responsive-table';

interface TableSectionProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Accessible label for the scroll region around the table */
  scrollLabel?: string;
  /**
   * When true (default), wrap children in a primary-bordered TableScroll.
   * Set false when children already include DesktopOnlyTable / TableScroll.
   */
  framed?: boolean;
}

/** Plain section heading + primary-bordered table frame — no Card chrome. */
export function TableSection({
  title,
  description,
  action,
  children,
  className,
  scrollLabel = 'Data table',
  framed = true,
}: TableSectionProps) {
  return (
    <section className={cn('space-y-3', className)}>
      {(title || action || description) && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            {title && (
              <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            )}
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {framed ? <TableScroll label={scrollLabel}>{children}</TableScroll> : children}
    </section>
  );
}
