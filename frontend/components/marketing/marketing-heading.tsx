import { cn } from '@/lib/utils';

export function MarketingHeading({
  as: Tag = 'h2',
  children,
  className,
}: {
  as?: 'h1' | 'h2' | 'h3';
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Tag
      className={cn(
        'font-semibold tracking-tight text-[#152238]',
        Tag === 'h1' && 'text-[2rem] leading-[1.12] sm:text-5xl lg:text-[3.4rem]',
        Tag === 'h2' && 'text-3xl leading-tight sm:text-4xl',
        Tag === 'h3' && 'text-xl sm:text-2xl',
        className
      )}
    >
      {children}
    </Tag>
  );
}
