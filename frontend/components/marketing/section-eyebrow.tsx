import { cn } from '@/lib/utils';

export function SectionEyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        'text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--ms-teal)]',
        className
      )}
    >
      {children}
    </p>
  );
}
