import { apiFetch } from '../api';
import type { Appointment, AppointmentSlot } from '../types';

export const appointmentsApi = {
  list: (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : '';
    return apiFetch<Appointment[]>(`/api/appointments${query}`);
  },
  get: (id: string) => apiFetch<Appointment>(`/api/appointments/${id}`),
  count: (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : '';
    return apiFetch<{ count: number }>(`/api/appointments/count${query}`);
  },
  slots: (params: {
    doctor_id: string;
    date: string;
    duration_minutes?: number;
    exclude_id?: string;
  }) => {
    const q = new URLSearchParams({
      doctor_id: params.doctor_id,
      date: params.date,
    });
    if (params.duration_minutes != null) q.set('duration_minutes', String(params.duration_minutes));
    if (params.exclude_id) q.set('exclude_id', params.exclude_id);
    return apiFetch<AppointmentSlot[]>(`/api/appointments/slots?${q}`);
  },
  create: (data: Record<string, unknown>) =>
    apiFetch<Appointment>('/api/appointments', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  createCheckUp: (data: {
    parent_record_id: string;
    patient_id: string;
    doctor_id: string;
    scheduled_at: string;
    duration_minutes?: number;
    type: 'IN_PERSON' | 'TELEMEDICINE';
    reason?: string;
  }) =>
    apiFetch<{ appointment: Appointment; medical_record: import('../types').MedicalRecord }>(
      '/api/appointments/check-up',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),
  confirmTelemedicineDecision: (
    id: string,
    decision: 'ACCEPTED_VIDEO' | 'SWITCHED_IN_PERSON'
  ) =>
    apiFetch<Appointment>(`/api/appointments/${id}/telemedicine-decision`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    }),
  update: (id: string, data: Record<string, unknown>) =>
    apiFetch<Appointment>(`/api/appointments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  stats: () =>
    apiFetch<{ today_count: number; pending_count: number; recent: Appointment[] }>(
      '/api/appointments/stats'
    ),
};
