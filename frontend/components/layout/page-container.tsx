import { cn } from '@/lib/utils';

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
  full: 'max-w-full',
} as const;

export type PageContainerSize = keyof typeof sizeClasses;

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  size?: PageContainerSize;
  /** When true, centers content vertically (auth screens). */
  centered?: boolean;
}

export function PageContainer({
  children,
  className,
  size = 'lg',
  centered = false,
}: PageContainerProps) {
  return (
    <div
      className={cn(
        'min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8',
        centered && 'flex flex-col items-center justify-center',
        className
      )}
    >
      <div className={cn('mx-auto w-full', sizeClasses[size])}>{children}</div>
    </div>
  );
}
