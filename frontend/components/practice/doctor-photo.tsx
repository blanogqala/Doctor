'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { shouldRenderDoctorPhoto } from '@/lib/doctor-photo';

interface DoctorPhotoProps {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  fallback: ReactNode;
}

/**
 * Public doctor photo with graceful fallback on null src or load failure.
 * Caller supplies the fallback so hero/about/admin visuals stay unchanged.
 */
export function DoctorPhoto({ src, alt = '', className, fallback }: DoctorPhotoProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  useEffect(() => {
    setFailedSrc(null);
  }, [src]);

  const showImage = shouldRenderDoctorPhoto(src, failedSrc);

  if (!showImage) {
    return <>{fallback}</>;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={cn(className)}
      onError={() => setFailedSrc(src)}
    />
  );
}
