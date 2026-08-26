import { formatDate } from '@/lib/format';
import type { MedicalRecordAmendment } from '@/lib/types';
import { ClinicalSection } from '@/components/records/clinical-section';
import { doctorDisplayName } from '@/lib/clinical/patient-folder';

export function AmendmentsList({
  amendments,
  doctorNameById,
}: {
  amendments: MedicalRecordAmendment[];
  /** Optional map of doctor profile id → display name */
  doctorNameById?: Record<string, string>;
}) {
  if (!amendments.length) return null;

  const sorted = [...amendments].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <ClinicalSection title="Amendments" description="Corrections appended after finalization. Original clinical content is unchanged.">
      <ul className="space-y-3">
        {sorted.map((a) => {
          const author =
            doctorNameById?.[a.doctor_id] != null
              ? doctorDisplayName(doctorNameById[a.doctor_id])
              : null;
          return (
            <li
              key={a.id}
              className="rounded-md border border-warning/30 bg-warning-soft/40 p-3"
            >
              <p className="text-xs font-medium text-muted-foreground">
                Amendment · {formatDate(a.created_at, true)}
                {author ? ` · ${author}` : ''}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Reason</p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">
                {a.correction_note}
              </p>
            </li>
          );
        })}
      </ul>
    </ClinicalSection>
  );
}
