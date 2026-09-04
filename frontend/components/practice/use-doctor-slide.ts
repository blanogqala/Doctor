'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PracticeDoctorSummary } from '@/lib/tenant';

export const DOCTOR_SLIDE_DEFAULT_AUTOPLAY_MS = 7000;

export type DoctorSlideOptions = {
  autoplayMs?: number;
};

export function useDoctorSlide(
  doctors: PracticeDoctorSummary[],
  options: DoctorSlideOptions = {}
) {
  const autoplayMs = options.autoplayMs ?? DOCTOR_SLIDE_DEFAULT_AUTOPLAY_MS;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [motionReady, setMotionReady] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [timerNonce, setTimerNonce] = useState(0);
  const pauseSourcesRef = useRef(new Set<string>());
  const count = doctors.length;

  useEffect(() => {
    if (count === 0) {
      setIndex(0);
      return;
    }
    setIndex((i) => (i >= count ? 0 : i));
  }, [count]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(mq.matches);
    sync();
    setMotionReady(true);
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const restartTimer = useCallback(() => {
    setTimerNonce((n) => n + 1);
  }, []);

  const goTo = useCallback(
    (nextIndex: number) => {
      if (count <= 1) return;
      setIndex(((nextIndex % count) + count) % count);
      restartTimer();
    },
    [count, restartTimer]
  );

  const goPrev = useCallback(() => {
    if (count <= 1) return;
    setIndex((i) => (i - 1 + count) % count);
    restartTimer();
  }, [count, restartTimer]);

  const goNext = useCallback(() => {
    if (count <= 1) return;
    setIndex((i) => (i + 1) % count);
    restartTimer();
  }, [count, restartTimer]);

  const pause = useCallback((source = 'default') => {
    pauseSourcesRef.current.add(source);
    setPaused(true);
  }, []);

  const resume = useCallback((source = 'default') => {
    pauseSourcesRef.current.delete(source);
    setPaused(pauseSourcesRef.current.size > 0);
  }, []);

  const canAutoplay = motionReady && !reducedMotion && count > 1 && !paused;

  useEffect(() => {
    if (!canAutoplay) return;
    const id = window.setTimeout(() => {
      setIndex((i) => (i + 1) % count);
    }, autoplayMs);
    return () => window.clearTimeout(id);
  }, [canAutoplay, autoplayMs, count, index, timerNonce]);

  return {
    doctor: count > 0 ? doctors[index] : undefined,
    doctors,
    index,
    goPrev,
    goNext,
    goTo,
    pause,
    resume,
    showControls: count > 1,
  };
}

export type DoctorSlide = ReturnType<typeof useDoctorSlide>;
