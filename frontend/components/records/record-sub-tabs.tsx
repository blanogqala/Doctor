'use client';

import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Stethoscope, Pill, ArrowRightLeft, Lock, Video } from 'lucide-react';
import { cn } from '@/lib/utils';

export const RECORD_TAB_TRIGGER_CLASS = cn(
  'gap-1.5 transition-colors duration-200',
  'data-[state=inactive]:bg-transparent data-[state=inactive]:text-slate-600',
  'data-[state=inactive]:hover:bg-primary/10',
  'data-[state=active]:bg-primary data-[state=active]:font-semibold data-[state=active]:text-primary-foreground data-[state=active]:shadow-none'
);

interface RecordSubTabsProps {
  sticky?: boolean;
  className?: string;
  /** Patient view omits Doctor's Notes (private). */
  variant?: 'doctor' | 'patient' | 'checkup';
  /** Checkup telemedicine: label Clinical as Telemedicine. */
  clinicalLabel?: 'Clinical Notes' | 'Telemedicine';
}

export function RecordSubTabs({
  sticky = true,
  className,
  variant = 'doctor',
  clinicalLabel = 'Clinical Notes',
}: RecordSubTabsProps) {
  const isPatient = variant === 'patient';
  const isTelemedicine = clinicalLabel === 'Telemedicine';
  const cols = isPatient ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4';

  return (
    <TabsList
      className={cn(
        'grid h-auto w-full gap-1 bg-muted/60 p-1 print:hidden',
        sticky ? 'mb-6' : 'mb-0',
        cols,
        sticky && 'sticky top-[calc(4rem+4.5rem)] z-20 lg:top-[4.5rem]',
        className
      )}
    >
      <TabsTrigger value="clinical" className={RECORD_TAB_TRIGGER_CLASS}>
        {isTelemedicine ? (
          <Video className="h-4 w-4" />
        ) : (
          <Stethoscope className="h-4 w-4" />
        )}
        <span className="hidden sm:inline">{clinicalLabel}</span>
        <span className="sm:hidden">{isTelemedicine ? 'Video' : 'Clinical'}</span>
      </TabsTrigger>
      <TabsTrigger value="prescription" className={RECORD_TAB_TRIGGER_CLASS}>
        <Pill className="h-4 w-4" />
        <span className="hidden sm:inline">Prescription</span>
        <span className="sm:hidden">Rx</span>
      </TabsTrigger>
      <TabsTrigger value="referral" className={RECORD_TAB_TRIGGER_CLASS}>
        <ArrowRightLeft className="h-4 w-4" />
        <span>Letters</span>
      </TabsTrigger>
      {!isPatient && (
        <TabsTrigger value="notes" className={RECORD_TAB_TRIGGER_CLASS}>
          <Lock className="h-4 w-4" />
          <span className="hidden sm:inline">Doctor&apos;s Notes</span>
          <span className="sm:hidden">Notes</span>
        </TabsTrigger>
      )}
    </TabsList>
  );
}
