import { cn } from '@/lib/utils';

export function ClinicalSection({
  title,
  description,
  children,
  className,
  empty,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
  /** When true, section is not rendered (caller should pass only when content exists). */
  empty?: boolean;
}) {
  if (empty) return null;
  return (
    <section
      className={cn(
        'rounded-lg border border-border bg-primary/5 p-4 shadow-sm sm:p-5',
        className
      )}
      aria-labelledby={undefined}
    >
      <header className="mb-3 space-y-0.5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </header>
      <div className="space-y-3 text-sm text-foreground">{children}</div>
    </section>
  );
}

export function ClinicalField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  if (children == null || children === '') return null;
  return (
    <div className={cn('space-y-1', className)}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="whitespace-pre-line text-sm text-foreground">{children}</div>
    </div>
  );
}

export function ClinicalSummary({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-full flex-col rounded-lg border border-primary/50 bg-primary/5 p-4 text-sm text-foreground',
        className
      )}
    >
      {children}
    </div>
  );
}
