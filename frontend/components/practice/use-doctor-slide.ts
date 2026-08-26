'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PracticeDoctorSummary } from '@/lib/tenant';

export function useDoctorSlide(doctors: PracticeDoctorSummary[]) {
  const [index, setIndex] = useState(0);
  const count = doctors.length;

  useEffect(() => {
    if (count === 0) {
      setIndex(0);
      return;
    }
    setIndex((i) => (i >= count ? 0 : i));
  }, [count]);

  const goPrev = useCallback(() => {
    if (count <= 1) return;
    setIndex((i) => (i - 1 + count) % count);
  }, [count]);

  const goNext = useCallback(() => {
    if (count <= 1) return;
    setIndex((i) => (i + 1) % count);
  }, [count]);

  return {
    doctor: count > 0 ? doctors[index] : undefined,
    index,
    goPrev,
    goNext,
    showControls: count > 1,
  };
}
