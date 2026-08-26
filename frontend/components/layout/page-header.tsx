import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Primary CTA (right on desktop, below on mobile) */
  actions?: React.ReactNode;
  className?: string;
  /** Optional leading element (back link, icon) */
  leading?: React.ReactNode;
}

/**
 * Responsive page header: title + description left, actions right (stacked on mobile).
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
  leading,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
        className
      )}
    >
      <div className="min-w-0 space-y-1">
        {leading && <div className="mb-1">{leading}</div>}
        <h1 className="text-page-title">{title}</h1>
        {description && <p className="max-w-2xl text-body-sm">{description}</p>}
      </div>
      {actions && (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {actions}
        </div>
      )}
    </header>
  );
}
