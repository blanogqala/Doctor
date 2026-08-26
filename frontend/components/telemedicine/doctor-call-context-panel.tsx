'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FolderOpen, FileText } from 'lucide-react';

interface DoctorCallContextPanelProps {
  patientName: string;
  reason?: string | null;
  patientFolderHref: string;
  consultationHref?: string;
}

export function DoctorCallContextPanel({
  patientName,
  reason,
  patientFolderHref,
  consultationHref,
}: DoctorCallContextPanelProps) {
  return (
    <aside className="hidden w-full shrink-0 flex-col gap-3 border-l border-white/10 bg-slate-900/95 p-4 text-white lg:flex lg:w-64 xl:w-72">
      <div>
        <p className="text-xs uppercase tracking-wide text-white/50">Patient</p>
        <p className="font-semibold">{patientName}</p>
        {reason && <p className="mt-1 text-sm text-white/70">{reason}</p>}
      </div>
      <div className="space-y-2">
        <Button asChild variant="secondary" className="w-full justify-start">
          <Link href={patientFolderHref} target="_blank" rel="noopener noreferrer">
            <FolderOpen className="mr-2 h-4 w-4" />
            Open Patient Folder
          </Link>
        </Button>
        {consultationHref && (
          <Button asChild variant="outline" className="w-full justify-start border-white/20 text-white">
            <Link href={consultationHref}>
              <FileText className="mr-2 h-4 w-4" />
              Open Consultation
            </Link>
          </Button>
        )}
      </div>
      <p className="text-xs text-white/50">
        AI scribe records your microphone only during a video call — use post-call dictation for
        full notes if needed.
      </p>
    </aside>
  );
}
