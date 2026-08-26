import { cn } from '@/lib/utils';
import { Badge, type BadgeProps } from '@/components/ui/badge';

export type StatusTone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'primary';

const toneClasses: Record<StatusTone, string> = {
  neutral: 'border-border bg-muted text-muted-foreground',
  info: 'border-info/20 bg-info-soft text-info',
  success: 'border-success/20 bg-success-soft text-success',
  warning: 'border-warning/25 bg-warning-soft text-warning-foreground',
  danger: 'border-danger/20 bg-danger-soft text-danger',
  primary: 'border-primary/20 bg-primary-soft text-primary',
};

interface StatusBadgeProps extends Omit<BadgeProps, 'variant'> {
  tone?: StatusTone;
  label: string;
}

/** Semantic status chip — prefer this over ad-hoc color classes. */
export function StatusBadge({ tone = 'neutral', label, className, ...props }: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'inline-flex h-6 min-h-6 items-center px-2 text-xs font-medium leading-none capitalize',
        toneClasses[tone],
        className
      )}
      {...props}
    >
      {label}
    </Badge>
  );
}

export { toneClasses as statusToneClasses };
