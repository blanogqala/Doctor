import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center',
        className
      )}
    >
      {icon && (
        <div className="mb-4 rounded-lg bg-primary-soft p-3 text-primary" aria-hidden>
          {icon}
        </div>
      )}
      <h3 className="text-section">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-body-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
