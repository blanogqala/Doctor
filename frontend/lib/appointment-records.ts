import type { Appointment } from '@/lib/types';

/** Child checkup record linked to an appointment, if any. */
export function checkupRecordIdFromAppointment(appt: Appointment): string | null {
  const records = appt.medical_records ?? [];
  const child = records.find((r) => r.parent_record_id);
  if (child?.id) return child.id;
  if (records.length === 1) return records[0].id;
  return records[0]?.id ?? null;
}
