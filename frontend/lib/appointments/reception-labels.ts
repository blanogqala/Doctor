import type { Appointment } from '@/lib/types';

/** Reception home: operational fields only — never clinical notes/diagnosis. */
export function receptionAppointmentLabel(appt: Appointment): {
  patient: string;
  doctor: string;
  reason?: string;
} {
  return {
    patient: appt.patient?.profile?.full_name ?? 'Unknown patient',
    doctor: appt.doctor?.profile?.full_name ?? 'Unassigned doctor',
    reason: appt.reason?.trim() || undefined,
  };
}
