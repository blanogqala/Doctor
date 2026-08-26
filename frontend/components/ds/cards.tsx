import { cn } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface StandardCardProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export function StandardCard({
  title,
  description,
  children,
  footer,
  className,
  contentClassName,
}: StandardCardProps) {
  return (
    <Card className={cn('shadow-soft', className)}>
      {(title || description) && (
        <CardHeader className="pb-3">
          {title && <CardTitle className="text-card-title">{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
      <CardContent className={cn(!title && !description && 'pt-6', contentClassName)}>
        {children}
      </CardContent>
      {footer && <CardFooter>{footer}</CardFooter>}
    </Card>
  );
}

interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  context?: string;
  trend?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  tone?: 'default' | 'primary' | 'info' | 'success' | 'warning' | 'danger' | 'clinical';
}

const metricToneStyles: Record<
  NonNullable<MetricCardProps['tone']>,
  { card: string; icon: string; accent: string }
> = {
  default: {
    card: 'border-border/50',
    icon: 'bg-muted text-muted-foreground',
    accent: 'bg-muted-foreground/20',
  },
  primary: {
    card: 'border-primary/50',
    icon: 'bg-primary-soft text-primary',
    accent: 'bg-primary/70',
  },
  info: {
    card: 'border-info/50',
    icon: 'bg-info-soft text-info',
    accent: 'bg-info/70',
  },
  success: {
    card: 'border-success/50',
    icon: 'bg-success-soft text-success',
    accent: 'bg-success/70',
  },
  warning: {
    card: 'border-warning/50',
    icon: 'bg-warning-soft text-warning',
    accent: 'bg-warning/80',
  },
  danger: {
    card: 'border-danger/50',
    icon: 'bg-danger-soft text-danger',
    accent: 'bg-danger/70',
  },
  clinical: {
    card: 'border-secondary/50',
    icon: 'bg-secondary/10 text-secondary',
    accent: 'bg-secondary/70',
  },
};

export type MetricGridColumns = 'default' | 'reception' | 'single';

const metricGridClasses: Record<MetricGridColumns, string> = {
  default: 'grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-stretch',
  reception: 'grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 items-stretch',
  single: 'grid gap-4 grid-cols-1 items-stretch',
};

interface MetricGridProps {
  children: React.ReactNode;
  columns?: MetricGridColumns;
  className?: string;
}

/** Responsive metric row with equal-height cards. */
export function MetricGrid({ children, columns = 'default', className }: MetricGridProps) {
  return (
    <div className={cn(metricGridClasses[columns], className)}>
      {children}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  context,
  trend,
  icon,
  className,
  tone = 'default',
}: MetricCardProps) {
  const styles = metricToneStyles[tone];
  return (
    <Card
      className={cn(
        'dashboard-stat relative flex h-full min-h-[7.5rem] flex-col overflow-hidden border shadow-soft',
        styles.card,
        className
      )}
    >
      <span
        className={cn('absolute inset-x-0 top-0 z-[2] h-0.5', styles.accent)}
        aria-hidden
      />
      <CardContent className="relative z-[1] flex flex-1 flex-col justify-start px-5 pb-5 pt-7">
        <div className="grid min-h-[2.75rem] grid-cols-[minmax(0,1fr)_2.25rem] items-start gap-x-3">
          <p className="metric-label min-w-0 pr-0.5">{label}</p>
          {icon ? (
            <div
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                styles.icon
              )}
            >
              {icon}
            </div>
          ) : (
            <div className="h-9 w-9 shrink-0" aria-hidden />
          )}
        </div>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
          {value}
        </p>
        <div
          className={cn(
            'mt-1 min-h-[1.125rem] text-caption',
            !context && !trend && 'invisible'
          )}
          aria-hidden={!context && !trend}
        >
          {(context || trend) && (
            <div className="flex flex-wrap items-center gap-2">
              {trend}
              {context && <span>{context}</span>}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface ActionCardProps {
  title: string;
  description?: string;
  action: React.ReactNode;
  className?: string;
}

export function ActionCard({ title, description, action, className }: ActionCardProps) {
  return (
    <Card className={cn('border-primary/20 bg-primary-soft/40 shadow-soft', className)}>
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-card-title">{title}</p>
          {description && <p className="text-body-sm">{description}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">{action}</div>
      </CardContent>
    </Card>
  );
}

interface ClinicalSummaryCardProps {
  title: string;
  children: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}

export function ClinicalSummaryCard({
  title,
  children,
  meta,
  className,
}: ClinicalSummaryCardProps) {
  return (
    <Card className={cn('border-border shadow-soft', className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
        <CardTitle className="text-card-title">{title}</CardTitle>
        {meta && <div className="text-caption">{meta}</div>}
      </CardHeader>
      <CardContent className="text-body">{children}</CardContent>
    </Card>
  );
}

interface WarningCardProps {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function WarningCard({ title, children, action, className }: WarningCardProps) {
  return (
    <Card
      className={cn(
        'border-warning/40 bg-warning-soft shadow-none',
        className
      )}
      role="status"
    >
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-warning-foreground">{title}</p>
          {children && <div className="text-sm text-warning-foreground/90">{children}</div>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </CardContent>
    </Card>
  );
}
