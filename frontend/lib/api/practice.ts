import { apiFetch, apiFormFetch, getApiBaseUrl } from '../api';

export interface PracticeOfficeHours {
  monFri?: string;
  saturday?: string;
  sunday?: string;
  [key: string]: string | undefined;
}

export interface LandingServiceItem {
  title: string;
  description: string;
  icon: string;
}

export interface Practice {
  id: string;
  subdomain: string;
  clinic_name: string;
  logo_url: string | null;
  brand_color: string;
  tagline: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  address_line1: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  map_embed_url: string | null;
  emergency_phone: string | null;
  office_hours: PracticeOfficeHours | null;
  landing_services: LandingServiceItem[] | null;
  services_intro: string | null;
  subscription_status: string;
  trial_ends_at: string | null;
  monthly_fee_cents: number;
  setup_fee_paid: boolean;
  created_at: string;
  updated_at: string;
}

export interface PracticeDoctorPublic {
  id: string;
  full_name: string;
  specialization?: string;
  consultation_fee_cents?: number;
  telemedicine_fee_cents?: number;
  bio?: string | null;
  photo_url?: string | null;
  credentials?: string[];
  hpcsa_registration_number?: string | null;
  is_verified?: boolean;
}

export type PracticeUpdatePayload = {
  clinic_name?: string;
  brand_color?: string;
  tagline?: string | null;
  phone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  address_line1?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  map_embed_url?: string | null;
  emergency_phone?: string | null;
  office_hours?: PracticeOfficeHours | null;
  services_intro?: string | null;
  landing_services?: LandingServiceItem[] | null;
};

export type DoctorPublicUpdatePayload = {
  bio?: string | null;
  telemedicine_fee_cents?: number;
  consultation_fee_cents?: number;
  credentials?: string[] | null;
};

export const practiceApi = {
  get: () => apiFetch<Practice>('/api/practice'),

  update: (data: PracticeUpdatePayload) =>
    apiFetch<Practice>('/api/practice', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  updateDoctor: (doctorId: string, data: DoctorPublicUpdatePayload) =>
    apiFetch<PracticeDoctorPublic>(`/api/practice/doctors/${doctorId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  uploadLogo: async (file: File): Promise<Practice> => {
    const form = new FormData();
    form.append('logo', file);
    return apiFormFetch<Practice>('/api/practice/logo', form, { method: 'POST' });
  },

  uploadDoctorPhoto: async (doctorId: string, file: File): Promise<PracticeDoctorPublic> => {
    const form = new FormData();
    form.append('photo', file);
    return apiFormFetch<PracticeDoctorPublic>(`/api/practice/doctors/${doctorId}/photo`, form, {
      method: 'POST',
    });
  },
};

export async function fetchNextSlots(opts: {
  subdomain: string;
  doctorId: string;
  limit?: number;
}): Promise<Array<{ start: string; end: string }>> {
  const params = new URLSearchParams({
    subdomain: opts.subdomain,
    doctor_id: opts.doctorId,
    limit: String(opts.limit ?? 3),
  });
  const res = await fetch(`${getApiBaseUrl()}/api/public/next-slots?${params}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load slots');
  }
  const data = await res.json();
  return data.slots || [];
}
