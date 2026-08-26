import { StatusBadge, type StatusTone } from '@/components/ds/status-badge';
import type { MedicalRecord } from '@/lib/types';
import { recordStatusLabel } from '@/lib/clinical/patient-folder';

const toneByStatus: Record<'Draft' | 'Finalized' | 'Erroneous' | 'Amended', StatusTone> = {
  Draft: 'warning',
  Finalized: 'success',
  Erroneous: 'danger',
  Amended: 'info',
};

export function RecordStatusBadge({
  record,
  amended,
  className,
}: {
  record: Pick<MedicalRecord, 'is_draft' | 'is_erroneous'>;
  amended?: boolean;
  className?: string;
}) {
  if (amended && !record.is_erroneous && !record.is_draft) {
    return <StatusBadge tone={toneByStatus.Amended} label="Amended" className={className} />;
  }
  const label = recordStatusLabel(record as MedicalRecord);
  return <StatusBadge tone={toneByStatus[label]} label={label} className={className} />;
}
