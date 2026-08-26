import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface DashboardSectionProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  /** Elevate visually for primary workflow panels */
  priority?: 'primary' | 'secondary';
}

export function DashboardSection({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
  priority = 'secondary',
}: DashboardSectionProps) {
  return (
    <Card
      className={cn(
        'shadow-soft',
        priority === 'primary' && 'border-primary/25 ring-1 ring-primary/10',
        className
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-card-title">{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      </CardHeader>
      <CardContent className={cn(contentClassName)}>{children}</CardContent>
    </Card>
  );
}
