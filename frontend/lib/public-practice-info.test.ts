import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPublicPracticeInfo, parsePublicPracticeInfo } from './public-practice-info';

const PILOT_PAYLOAD = {
  id: 'prac-pilot',
  subdomain: 'pilot',
  clinic_name: 'Pilot Clinic',
  logo_url: null,
  brand_color: '#800000',
  tagline: null,
  phone: null,
  email: null,
  whatsapp: null,
  address_line1: null,
  city: null,
  province: null,
  postal_code: null,
  map_embed_url: null,
  emergency_phone: null,
  office_hours: null,
  landing_services: null,
  services_intro: null,
  subscription_status: 'ACTIVE',
  trial_ends_at: null,
  booking_available: true,
  doctors: [
    {
      id: 'doc-1',
      full_name: 'Dr Pilot',
      specialization: 'GP',
      consultation_fee_cents: 50000,
      bio: null,
      credentials: 'not-an-array',
      hpcsa_registration_number: null,
      is_verified: true,
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('parsePublicPracticeInfo', () => {
  it('normalizes doctors credentials and default telemedicine fee', () => {
    const parsed = parsePublicPracticeInfo(PILOT_PAYLOAD as unknown as Record<string, unknown>);
    expect(parsed.brand_color).toBe('#800000');
    expect(parsed.doctors[0].telemedicine_fee_cents).toBe(45000);
    expect(parsed.doctors[0].credentials).toEqual([]);
    expect(parsed.doctors[0].photo_url).toBeNull();
  });
});

describe('fetchPublicPracticeInfo', () => {
  it('returns parsed maroon branding for pilot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        expect(url).toBe('https://api.example/api/public/practice-info?subdomain=pilot');
        return {
          ok: true,
          json: async () => PILOT_PAYLOAD,
        };
      })
    );

    const info = await fetchPublicPracticeInfo('pilot', 'https://api.example');
    expect(info).not.toBeNull();
    expect(info?.subdomain).toBe('pilot');
    expect(info?.brand_color).toBe('#800000');
  });

  it('returns null for unknown subdomain (404)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Practice not found' }),
      }))
    );

    await expect(fetchPublicPracticeInfo('missing', 'https://api.example')).resolves.toBeNull();
  });

  it('returns null on network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      })
    );

    await expect(fetchPublicPracticeInfo('pilot', 'https://api.example')).resolves.toBeNull();
  });

  it('returns null without fetching when subdomain is empty', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchPublicPracticeInfo('  ', 'https://api.example')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('strips trailing slash from api base url', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => PILOT_PAYLOAD,
    }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchPublicPracticeInfo('pilot', 'https://api.example/');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example/api/public/practice-info?subdomain=pilot',
      undefined
    );
  });

  it('forwards cache: no-store so SSR branding is not stale', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => PILOT_PAYLOAD,
    }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchPublicPracticeInfo('pilot', 'https://api.example', { cache: 'no-store' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example/api/public/practice-info?subdomain=pilot',
      { cache: 'no-store' }
    );
  });
});
