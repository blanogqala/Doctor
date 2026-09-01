export const DEMO_PRACTICE_URL =
  process.env.NEXT_PUBLIC_DEMO_PRACTICE_URL || 'http://eastern-cape.localhost:3000';

export const PLATFORM_DOMAIN = 'MediNathi.co.za';

export const SA_PROVINCES = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'Northern Cape',
  'North West',
  'Western Cape',
] as const;

/** @deprecated Legacy Eastern Cape city list — preserved for reference only. New inquiries use province + free-text city. */
export const SA_CITIES = [
  'Port Elizabeth',
  'East London',
  'Mthatha',
  'Grahamstown',
  'Queenstown',
  'Uitenhage',
  'Other',
] as const;

export const REFERRAL_SOURCES = [
  'Google Search',
  'Colleague Referral',
  'Social Media',
  'Medical Conference',
  'Other',
] as const;

/** @deprecated Legacy practice type — new inquiries use requested_subscription_plan. */
export const PRACTICE_TYPES = [
  { value: 'SOLO', label: 'Solo Practice' },
  { value: 'SMALL_CLINIC', label: 'Small Clinic (2–5 doctors)' },
  { value: 'LARGE_CLINIC', label: 'Large Clinic (6+ doctors)' },
] as const;
