'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { HeartPulse } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  PRACTICE_LOGO_SIZE_CLASS,
  shouldRenderPracticeLogo,
  type PracticeLogoSize,
} from '@/lib/practice-logo';

interface PracticeLogoProps {
  src: string | null | undefined;
  alt?: string;
  size?: PracticeLogoSize;
  className?: string;
  fallbackClassName?: string;
  fallbackIcon?: ComponentType<{ className?: string }>;
}

export function PracticeLogo({
  src,
  alt = '',
  size = 'md',
  className,
  fallbackClassName,
  fallbackIcon: FallbackIcon = HeartPulse,
}: PracticeLogoProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  useEffect(() => {
    setFailedSrc(null);
  }, [src]);

  const showImage = shouldRenderPracticeLogo(src, failedSrc);
  const box = PRACTICE_LOGO_SIZE_CLASS[size];

  if (!showImage) {
    return (
      <div
        className={cn(
          box,
          'flex shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm',
          fallbackClassName
        )}
      >
        <FallbackIcon className="h-[46%] w-[46%]" aria-hidden />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={cn(box, 'shrink-0 object-contain', className)}
      onError={() => setFailedSrc(src)}
    />
  );
}
