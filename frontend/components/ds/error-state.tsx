import { AlertCircle, Lock, SearchX, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export type ErrorKind =
  | 'validation'
  | 'api'
  | 'forbidden'
  | 'not_found'
  | 'session'
  | 'unexpected';

interface ErrorStateProps {
  kind?: ErrorKind;
  title?: string;
  message?: string;
  action?: React.ReactNode;
  className?: string;
  onRetry?: () => void;
}

const defaults: Record<
  ErrorKind,
  { title: string; message: string; icon: React.ComponentType<{ className?: string }> }
> = {
  validation: {
    title: 'Please check your input',
    message: 'Some fields need attention before you can continue.',
    icon: AlertCircle,
  },
  api: {
    title: 'Something went wrong',
    message: 'We could not complete that request. Please try again.',
    icon: WifiOff,
  },
  forbidden: {
    title: 'Access denied',
    message: 'You do not have permission to view this content.',
    icon: Lock,
  },
  not_found: {
    title: 'Not found',
    message: 'The item you are looking for is unavailable.',
    icon: SearchX,
  },
  session: {
    title: 'Session expired',
    message: 'Please sign in again to continue.',
    icon: Lock,
  },
  unexpected: {
    title: 'Unexpected error',
    message: 'An unexpected error occurred. Please try again or contact support.',
    icon: AlertCircle,
  },
};

/** Full-block error feedback for pages/panels. Never expose backend details. */
export function ErrorState({
  kind = 'unexpected',
  title,
  message,
  action,
  className,
  onRetry,
}: ErrorStateProps) {
  const d = defaults[kind];
  const Icon = d.icon;
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-danger/20 bg-danger-soft/50 p-8 text-center',
        className
      )}
      role="alert"
    >
      <div className="mb-3 rounded-lg bg-danger-soft p-3 text-danger">
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <h3 className="text-section">{title ?? d.title}</h3>
      <p className="mt-1 max-w-md text-body-sm">{message ?? d.message}</p>
      {(action || onRetry) && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {action}
          {onRetry && (
            <Button type="button" variant="outline" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

interface InlineErrorProps {
  message: string;
  className?: string;
}

export function InlineError({ message, className }: InlineErrorProps) {
  return (
    <p className={cn('flex items-start gap-1.5 text-sm text-destructive', className)} role="alert">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </p>
  );
}
