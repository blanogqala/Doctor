'use client';

import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import type { MedicalRecord } from '@/lib/types';
import {
  doctorDisplayName,
  recordComplaintSummary,
} from '@/lib/clinical/patient-folder';
import { RecordStatusBadge } from '@/components/records/record-status';
import { StatusBadge } from '@/components/ds/status-badge';
import { Button } from '@/components/ui/button';

export function ConsultationCard({
  record,
  variant = 'parent',
  onOpen,
  actions,
  className,
}: {
  record: MedicalRecord;
  variant?: 'parent' | 'follow_up';
  onOpen?: () => void;
  actions?: React.ReactNode;
  className?: string;
}) {
  const complaint = recordComplaintSummary(record);
  const doctor = doctorDisplayName(record.doctor?.profile?.full_name);
  const amended = (record.amendments?.length ?? 0) > 0;
  const typeLabel = variant === 'follow_up' ? 'Follow-up' : 'Consultation';
  const aiAssisted =
    record.has_scribe_recording ||
    (record.ai_field_provenance &&
      Object.values(record.ai_field_provenance).some((e) =>
        ['AI', 'AI_ACCEPTED', 'AI_ACCEPTED_AND_EDITED'].includes(e.source)
      ));

  return (
    <article
      className={cn(
        'rounded-lg border border-primary/50 bg-primary/5 p-4 shadow-sm transition-colors',
        onOpen && 'hover:bg-muted/30',
        record.is_erroneous && 'border-destructive/30 bg-destructive/5',
        className
      )}
    >
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            {typeLabel} · {formatDate(record.record_date, true)}
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <RecordStatusBadge record={record} amended={amended && !record.is_draft} />
            {aiAssisted && (
              <StatusBadge
                tone="neutral"
                label={record.is_draft ? 'AI-assisted draft' : 'AI-assisted'}
                className="normal-case"
              />
            )}
          </div>
        </div>

        <p className="line-clamp-2 text-sm text-muted-foreground">{complaint}</p>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-0.5">
            <p className="text-xs text-muted-foreground">{doctor}</p>
            {!record.is_draft && record.primary_diagnosis && (
              <p className="text-xs text-foreground">
                <span className="text-muted-foreground">Diagnosis: </span>
                {record.primary_diagnosis}
              </p>
            )}
            {record.follow_up_date && (
              <p className="text-xs text-muted-foreground">
                Follow-up: {formatDate(record.follow_up_date)}
              </p>
            )}
          </div>
          <div className="flex w-full flex-shrink-0 flex-wrap gap-2 sm:w-auto sm:justify-end">
            {onOpen && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onOpen}
                className="w-full sm:w-auto"
              >
                {record.is_draft ? 'Continue' : 'Open'}
              </Button>
            )}
            {actions}
          </div>
        </div>
      </div>
    </article>
  );
}
