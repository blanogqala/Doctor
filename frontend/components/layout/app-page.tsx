import { cn } from '@/lib/utils';

interface AppPageProps {
  children: React.ReactNode;
  className?: string;
  /** Constrain content width. Default matches prior dashboard-page. */
  width?: 'default' | 'narrow' | 'full';
}

const widthClass = {
  default: 'max-w-[1440px]',
  narrow: 'max-w-3xl',
  full: 'max-w-none',
} as const;

/**
 * Standard authenticated page container.
 * Horizontal padding lives on AppShell main; this controls max width + vertical rhythm.
 */
export function AppPage({ children, className, width = 'default' }: AppPageProps) {
  return (
    <div className={cn('dashboard-page w-full min-w-0 space-y-6', widthClass[width], className)}>
      {children}
    </div>
  );
}

interface SectionProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  description?: string;
}

export function Section({ children, className, title, description }: SectionProps) {
  return (
    <section className={cn('space-y-3', className)}>
      {(title || description) && (
        <div className="space-y-1">
          {title && <h2 className="text-section">{title}</h2>}
          {description && <p className="text-body-sm">{description}</p>}
        </div>
      )}
      {children}
    </section>
  );
}
