import { apiFetch } from '../api';

export type TelemedicineSessionState = 'NOT_STARTED' | 'WAITING' | 'ACTIVE' | 'ENDED';

export interface TelemedicineStatusResponse {
  session_state: TelemedicineSessionState;
  provider_configured: boolean;
  join_window: { can_join: boolean; message?: string };
  appointment: {
    id: string;
    scheduled_at: string;
    status: string;
    doctor_name: string;
    patient_name: string;
    doctor_joined_at: string | null;
    patient_joined_at: string | null;
    telemedicine_ended_at: string | null;
    reason: string | null;
  };
}

export interface TelemedicineJoinResponse {
  session_state: TelemedicineSessionState;
  livekit: {
    url: string;
    token: string;
    room_name: string;
  };
  appointment: {
    id: string;
    scheduled_at: string;
    status: string;
    doctor_name: string;
    patient_name: string;
    doctor_joined_at: string | null;
    patient_joined_at: string | null;
    telemedicine_started_at: string | null;
    telemedicine_ended_at: string | null;
    reason: string | null;
  };
  join_window: { can_join: boolean; message?: string };
}

export const telemedicineApi = {
  getStatus: (appointmentId: string) =>
    apiFetch<TelemedicineStatusResponse>(`/api/appointments/${appointmentId}/telemedicine`),
  join: (appointmentId: string) =>
    apiFetch<TelemedicineJoinResponse>(`/api/appointments/${appointmentId}/telemedicine/join`, {
      method: 'POST',
    }),
  leave: (appointmentId: string) =>
    apiFetch<{ session_state: TelemedicineSessionState }>(
      `/api/appointments/${appointmentId}/telemedicine/leave`,
      { method: 'POST' }
    ),
  end: (appointmentId: string) =>
    apiFetch<{ session_state: TelemedicineSessionState }>(
      `/api/appointments/${appointmentId}/telemedicine/end`,
      { method: 'POST' }
    ),
};
