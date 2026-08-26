'use client';

import { Folder } from 'lucide-react';
import { StatusBadge, type StatusTone } from '@/components/ds/status-badge';

interface PatientFolderCardProps {
  name: string;
  statusLabel: string;
  statusTone?: StatusTone;
  idLabel: string;
  lastVisitLabel: string;
  recordsLabel: string;
  onClick: () => void;
}

export function PatientFolderCard({
  name,
  statusLabel,
  statusTone = 'success',
  idLabel,
  lastVisitLabel,
  recordsLabel,
  onClick,
}: PatientFolderCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group min-w-0 overflow-hidden rounded-lg border-2 border-primary bg-primary/5 text-left shadow-sm transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center gap-2 bg-primary px-4 py-2 text-primary-foreground">
        <Folder className="h-4 w-4" aria-hidden />
        <span className="text-xs font-medium">Patient Folder</span>
      </div>
      <div className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="truncate font-semibold text-foreground group-hover:text-primary">
            {name}
          </h2>
          <StatusBadge tone={statusTone} label={statusLabel} />
        </div>
        <p className="text-xs text-muted-foreground">{idLabel}</p>
        <p className="text-xs text-muted-foreground">{lastVisitLabel}</p>
        <p className="text-xs text-muted-foreground">{recordsLabel}</p>
      </div>
    </button>
  );
}
