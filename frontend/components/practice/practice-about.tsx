'use client';

import { GraduationCap, Stethoscope } from 'lucide-react';
import { SectionReveal } from '@/components/marketing/section-reveal';
import { cn } from '@/lib/utils';
import { absoluteApiUrl } from '@/lib/tenant';
import { DoctorPhoto } from '@/components/practice/doctor-photo';
import {
  DoctorCarouselControls,
  DOCTOR_CAROUSEL_FRAME_CLASS,
  doctorCarouselInteractionProps,
} from './doctor-carousel-controls';
import type { DoctorSlide } from './use-doctor-slide';

interface PracticeAboutProps {
  doctorSlide: DoctorSlide;
}

export function PracticeAbout({ doctorSlide }: PracticeAboutProps) {
  const { doctor, showControls } = doctorSlide;

  if (!doctor) return null;

  const photoSrc = absoluteApiUrl(doctor.photo_url);
  const credentials =
    doctor.credentials?.length > 0
      ? doctor.credentials
      : [
          doctor.specialization,
          doctor.hpcsa_registration_number
            ? `HPCSA Registered (${doctor.hpcsa_registration_number})`
            : null,
        ].filter(Boolean) as string[];

  return (
    <section id="about" className="scroll-mt-16 bg-gradient-to-br from-primary/40 via-slate-50/50 to-primary/30 py-16 sm:py-20 border-b-2 border-primary">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:items-center">
        <SectionReveal className="min-w-0">
          <div
            className={cn(
              'relative overflow-hidden rounded-2xl shadow-md',
              DOCTOR_CAROUSEL_FRAME_CLASS
            )}
            {...doctorCarouselInteractionProps(doctorSlide, 'about')}
          >
            <div
              key={doctor.id}
              className={cn(showControls && 'animate-fade-in motion-reduce:animate-none')}
            >
              <DoctorPhoto
                src={photoSrc}
                alt={doctor.full_name}
                className="aspect-square max-h-[400px] w-full object-cover"
                fallback={
                  <div className="flex aspect-square max-h-[400px] w-full items-center justify-center bg-gradient-to-br from-primary to-primary/80 text-white">
                    <Stethoscope className="h-16 w-16 opacity-90 sm:h-20 sm:w-20" />
                  </div>
                }
              />
            </div>
            <DoctorCarouselControls
              doctors={doctorSlide.doctors}
              index={doctorSlide.index}
              showControls={showControls}
              goPrev={doctorSlide.goPrev}
              goNext={doctorSlide.goNext}
              goTo={doctorSlide.goTo}
              dotsPosition="bottom"
            />
          </div>
        </SectionReveal>

        <SectionReveal delayMs={80} className="min-w-0">
          <h2 className="text-3xl font-bold text-slate-900">Meet {doctor.full_name}</h2>
          <p className="mt-2 text-base font-medium text-slate-500">{doctor.specialization}</p>
          <p className="mt-5 text-base leading-relaxed text-slate-600">
            {doctor.bio ||
              `${doctor.full_name} provides compassionate family medicine with a focus on preventive care and clear communication.`}
          </p>
          <ul className="mt-8 space-y-3">
            {credentials.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-slate-700">
                <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </SectionReveal>
      </div>
    </section>
  );
}
