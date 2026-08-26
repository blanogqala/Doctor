import { appointmentsApi } from '@/lib/api/appointments';
import { checkupRecordIdFromAppointment } from '@/lib/appointment-records';
import { logAudit } from '@/lib/audit';
import type { Appointment } from '@/lib/types';

export type StartConsultationResult =
  | { ok: true; href: string }
  | { ok: false; error: string };

/**
 * Shared start-consultation flow used by Doctor Queue and Doctor Dashboard.
 * Updates appointment status, audits, and returns the record navigation href.
 */
export async function startConsultation(params: {
  appointment: Appointment;
  doctorId: string;
}): Promise<StartConsultationResult> {
  const { appointment: appt, doctorId } = params;

  try {
    await appointmentsApi.update(appt.id, {
      status: 'IN_CONSULTATION',
      locked_by_doctor_id: doctorId,
      doctor_joined_at: new Date().toISOString(),
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Update failed',
    };
  }

  await logAudit({
    action: 'UPDATE',
    resource: 'appointments',
    resource_id: appt.id,
    patient_id: appt.patient_id,
    old_value: { status: appt.status },
    new_value: { status: 'IN_CONSULTATION', locked_by_doctor_id: doctorId },
  });

  const childId = checkupRecordIdFromAppointment(appt);
  const href = childId
    ? `/doctor/records/${appt.patient_id}/edit/${childId}`
    : `/doctor/records?patient=${appt.patient_id}`;

  return { ok: true, href };
}

/** Continue an already-active consultation into the record editor. */
export function continueConsultationHref(appt: Appointment): string {
  const childId = checkupRecordIdFromAppointment(appt);
  if (childId) {
    return `/doctor/records/${appt.patient_id}/edit/${childId}`;
  }
  return `/doctor/records?patient=${appt.patient_id}`;
}
