import { apiFetch } from '../api';
import type { Patient, Doctor, Profile } from '../types';

export const patientsApi = {
  list: () => apiFetch<Patient[]>('/api/patients'),
  getById: (id: string) => apiFetch<Patient>(`/api/patients/${id}`),
  update: (id: string, data: Record<string, unknown>) =>
    apiFetch<Patient>(`/api/patients/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  softDelete: (id: string) =>
    apiFetch<Patient>(`/api/patients/${id}`, { method: 'DELETE' }),
  countMedicalRecords: (id: string) =>
    apiFetch<{ count: number }>(`/api/patients/${id}/medical-records/count`),
  checkEmail: (email: string) =>
    apiFetch<{ exists: boolean }>(`/api/patients/check-email?email=${encodeURIComponent(email)}`),
};

export const doctorsApi = {
  list: () => apiFetch<Doctor[]>('/api/doctors'),
};

export const profilesApi = {
  update: (data: { full_name?: string; phone?: string }) =>
    apiFetch<Profile>('/api/patients/profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
};
