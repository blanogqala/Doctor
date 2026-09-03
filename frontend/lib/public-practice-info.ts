/**
 * Public practice branding payload (practice-info API).
 * Safe for SSR theming: name, logo, brand colour, public contact/landing fields.
 * Does not include patients, staff secrets, billing, or clinical data.
 */

export interface PracticeOfficeHours {
  monFri?: string;
  saturday?: string;
  sunday?: string;
  [key: string]: string | undefined;
}

export interface PracticeDoctorSummary {
  id: string;
  full_name: string;
  specialization: string;
  consultation_fee_cents: number;
  telemedicine_fee_cents: number;
  bio: string | null;
  photo_url: string | null;
  credentials: string[];
  hpcsa_registration_number: string | null;
  is_verified: boolean;
}

export interface LandingServiceItem {
  title: string;
  description: string;
  icon: string;
}

export interface PracticeInfo {
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
  booking_available?: boolean;
  doctors: PracticeDoctorSummary[];
}

export function parsePublicPracticeInfo(data: Record<string, unknown>): PracticeInfo {
  const doctorsRaw = Array.isArray(data.doctors) ? data.doctors : [];
  const doctors = doctorsRaw.map((raw) => {
    const d = raw as PracticeDoctorSummary & { credentials?: string[] };
    return {
      ...d,
      telemedicine_fee_cents: d.telemedicine_fee_cents ?? 45000,
      credentials: Array.isArray(d.credentials) ? d.credentials : [],
      photo_url: d.photo_url ?? null,
    };
  });

  return {
    ...(data as unknown as PracticeInfo),
    doctors,
  };
}

/** Fetch public practice-info. Returns null on missing subdomain, 404, or network failure. */
export async function fetchPublicPracticeInfo(
  subdomain: string,
  apiBaseUrl: string,
  init?: RequestInit
): Promise<PracticeInfo | null> {
  const trimmed = subdomain.trim();
  if (!trimmed) return null;

  const origin = apiBaseUrl.replace(/\/$/, '');
  try {
    const res = await fetch(
      `${origin}/api/public/practice-info?subdomain=${encodeURIComponent(trimmed)}`,
      init
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    return parsePublicPracticeInfo(data);
  } catch {
    return null;
  }
}
