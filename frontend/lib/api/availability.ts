import { apiFetch } from '../api';
import type { AvailabilityWindow } from '../types';

export const availabilityApi = {
  list: (params: { doctor_id: string; from: string; to: string }) => {
    const q = new URLSearchParams(params);
    return apiFetch<AvailabilityWindow[]>(`/api/availability?${q}`);
  },
  replaceWeek: (data: {
    doctor_id: string;
    week_start: string;
    days: Array<{ date: string; blocks: Array<{ start_minute: number; end_minute: number }> }>;
  }) =>
    apiFetch<AvailabilityWindow[]>('/api/availability/week', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};
