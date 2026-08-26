'use client';

import { formatDate, formatTime } from '@/lib/format';
import { Loader2 } from 'lucide-react';
import { LocalPreviewTile } from './video-call-controls';

interface PatientWaitingRoomProps {
  doctorName: string;
  scheduledAt: string;
  reason?: string | null;
}

export function PatientWaitingRoom({ doctorName, scheduledAt, reason }: PatientWaitingRoomProps) {
  return (
    <div className="flex h-full flex-col bg-slate-950 text-white">
      <div className="relative flex-1">
        <RemoteWaitingPreview />
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/70 px-4 text-center">
          <p className="text-sm font-medium text-emerald-300">You&apos;re checked in</p>
          <p className="mt-2 text-lg font-semibold">{doctorName} will join shortly.</p>
          <p className="mt-1 text-sm text-white/70">
            {formatDate(scheduledAt)} at {formatTime(scheduledAt)}
          </p>
          {reason && <p className="mt-2 text-sm text-white/60">{reason}</p>}
          <div className="mt-4 flex items-center gap-2 text-sm text-white/80">
            <Loader2 className="h-4 w-4 animate-spin" />
            Waiting in the virtual waiting room
          </div>
        </div>
        <LocalPreviewTile className="absolute bottom-3 right-3 h-24 w-20 sm:h-28 sm:w-36" />
      </div>
    </div>
  );
}

function RemoteWaitingPreview() {
  return <div className="absolute inset-0 bg-gradient-to-b from-slate-900 to-slate-950" />;
}
