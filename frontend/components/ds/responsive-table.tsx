import { cn } from '@/lib/utils';
import { Table } from '@/components/ui/table';

interface TableScrollProps {
  children: React.ReactNode;
  className?: string;
  /** Accessible label for the scroll region */
  label?: string;
}

/**
 * Pattern A — horizontal scroll for dense tables.
 * Only the table scrolls; page root must not.
 */
export function TableScroll({ children, className, label = 'Data table' }: TableScrollProps) {
  return (
    <div
      className={cn(
        'relative w-full min-w-0 overflow-hidden overflow-x-auto rounded-xl border-2 border-primary bg-card',
        className
      )}
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      {children}
    </div>
  );
}

interface ResponsiveDataTableProps {
  children: React.ReactNode;
  className?: string;
  label?: string;
}

/** Convenience wrapper: bordered scroll region + Table. */
export function ResponsiveDataTable({
  children,
  className,
  label,
}: ResponsiveDataTableProps) {
  return (
    <TableScroll className={className} label={label}>
      <Table>{children}</Table>
    </TableScroll>
  );
}

interface MobileDataCardProps {
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}

/** Pattern C — single row as a mobile card. */
export function MobileDataCard({ children, className, actions }: MobileDataCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border/80 bg-card p-4 shadow-soft',
        className
      )}
    >
      <div className="min-w-0 space-y-1">{children}</div>
      {actions && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
          {actions}
        </div>
      )}
    </div>
  );
}

interface MobileDataListProps {
  children: React.ReactNode;
  className?: string;
}

export function MobileDataList({ children, className }: MobileDataListProps) {
  return <div className={cn('space-y-3 md:hidden', className)}>{children}</div>;
}

/** Hide table on small screens when a MobileDataList is shown. */
export function DesktopOnlyTable({
  children,
  className,
  label,
}: ResponsiveDataTableProps) {
  return (
    <div className={cn('hidden min-w-0 md:block', className)}>
      <ResponsiveDataTable label={label}>{children}</ResponsiveDataTable>
    </div>
  );
}
