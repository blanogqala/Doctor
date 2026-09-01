import { cn } from '@/lib/utils';

export function ProductFrame({
  title,
  children,
  className,
  dark = false,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  dark?: boolean;
}) {
  return (
    <figure
      className={cn(
        'overflow-hidden rounded-2xl border',
        dark
          ? 'border-white/10 bg-[#071525] text-white shadow-[0_28px_80px_-28px_rgba(0,0,0,0.65)]'
          : 'border-slate-200/80 bg-white text-[color:var(--ms-ink)] shadow-[0_28px_70px_-24px_rgba(11,31,51,0.35)]',
        className
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2 border-b px-4 py-2.5',
          dark ? 'border-white/10 bg-white/5' : 'border-slate-100 bg-slate-50/80'
        )}
      >
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
        </span>
        <figcaption className={cn('text-xs font-medium', dark ? 'text-white/70' : 'text-slate-500')}>
          {title} · Demo
        </figcaption>
      </div>
      <div className="min-h-[220px] p-4 sm:min-h-[280px] sm:p-5">{children}</div>
    </figure>
  );
}
