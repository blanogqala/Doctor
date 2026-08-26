import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

interface FormGridProps {
  children: React.ReactNode;
  className?: string;
  /** Columns at sm+. Default 2. */
  cols?: 1 | 2 | 3;
}

/**
 * Responsive form grid: single column on mobile, multi-column from sm up.
 */
export function FormGrid({ children, className, cols = 2 }: FormGridProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-4',
        cols === 2 && 'sm:grid-cols-2',
        cols === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        className
      )}
    >
      {children}
    </div>
  );
}

interface FieldProps {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}

export function Field({ id, label, required, hint, error, children, className }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id} className="text-label">
        {label}
        {required && (
          <span className="ml-0.5 text-destructive" aria-hidden>
            *
          </span>
        )}
        {required && <span className="sr-only"> (required)</span>}
      </Label>
      {children}
      {hint && !error && (
        <p id={hintId} className="text-caption">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-caption text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
