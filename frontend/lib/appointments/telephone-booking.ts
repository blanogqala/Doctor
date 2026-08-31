export type DraftTelephonePatient = { first_name: string; last_name: string };

export function buildAppointmentCreateBody(params: {
  doctor_id: string;
  scheduled_at: string;
  duration_minutes: number;
  type: string;
  reason: string | null;
  status: string;
  patient_id?: string;
  draftPatient?: DraftTelephonePatient | null;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    doctor_id: params.doctor_id,
    scheduled_at: params.scheduled_at,
    duration_minutes: params.duration_minutes,
    type: params.type,
    reason: params.reason,
    status: params.status,
  };
  if (params.draftPatient) {
    body.new_patient = {
      first_name: params.draftPatient.first_name,
      last_name: params.draftPatient.last_name,
    };
    return body;
  }
  body.patient_id = params.patient_id;
  return body;
}
