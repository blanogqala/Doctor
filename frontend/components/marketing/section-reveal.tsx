'use client';

import { cn } from '@/lib/utils';
import { useInView } from './use-in-view';
import { useEffect, useState } from 'react';

type SectionRevealProps = {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
};

export function SectionReveal({ children, className, delayMs = 0 }: SectionRevealProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    setReduceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      ref={ref}
      className={cn(
        'transition-all duration-500 ease-out',
        inView ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0',
        className
      )}
      style={inView && delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  );
}
