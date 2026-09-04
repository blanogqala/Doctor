'use client';

import type { FocusEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PracticeDoctorSummary } from '@/lib/tenant';
import type { DoctorSlide } from './use-doctor-slide';

export const DOCTOR_CAROUSEL_NAV_CLASS =
  'rounded-full border border-primary bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 focus-visible:ring-primary';

export const DOCTOR_CAROUSEL_FRAME_CLASS = 'border-2 border-primary';

export function doctorCarouselInteractionProps(
  slide: Pick<DoctorSlide, 'pause' | 'resume'>,
  region: string
) {
  return {
    onMouseEnter: () => slide.pause(`${region}-hover`),
    onMouseLeave: () => slide.resume(`${region}-hover`),
    onFocus: () => slide.pause(`${region}-focus`),
    onBlur: (event: FocusEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        slide.resume(`${region}-focus`);
      }
    },
  };
}

interface DoctorCarouselControlsProps {
  doctors: PracticeDoctorSummary[];
  index: number;
  showControls: boolean;
  goPrev: () => void;
  goNext: () => void;
  goTo: (index: number) => void;
  dotsPosition: 'top' | 'bottom';
}

export function DoctorCarouselControls({
  doctors,
  index,
  showControls,
  goPrev,
  goNext,
  goTo,
  dotsPosition,
}: DoctorCarouselControlsProps) {
  if (!showControls) return null;

  return (
    <>
      <Button
        type="button"
        variant="default"
        size="icon"
        className={cn(
          'absolute left-3 top-1/2 z-10 -translate-y-1/2',
          DOCTOR_CAROUSEL_NAV_CLASS
        )}
        onClick={goPrev}
        aria-label="Previous doctor"
      >
        <ChevronLeft className="h-5 w-5" />
      </Button>
      <Button
        type="button"
        variant="default"
        size="icon"
        className={cn(
          'absolute right-3 top-1/2 z-10 -translate-y-1/2',
          DOCTOR_CAROUSEL_NAV_CLASS
        )}
        onClick={goNext}
        aria-label="Next doctor"
      >
        <ChevronRight className="h-5 w-5" />
      </Button>
      <div
        className={cn(
          'absolute left-0 right-0 z-10 flex justify-center gap-0.5',
          dotsPosition === 'top' ? 'top-3' : 'bottom-3'
        )}
      >
        {doctors.map((doctor, i) => {
          const active = i === index;
          return (
            <button
              key={doctor.id}
              type="button"
              aria-label={`Show Dr ${doctor.full_name}`}
              aria-current={active ? 'true' : undefined}
              className="flex h-8 w-8 items-center justify-center"
              onClick={() => goTo(i)}
            >
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  active ? 'bg-primary' : 'bg-white/70 ring-1 ring-primary/30'
                )}
              />
            </button>
          );
        })}
      </div>
    </>
  );
}
