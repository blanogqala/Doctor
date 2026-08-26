import { describe, expect, it } from 'vitest';
import { inquirySchema } from './inquiry-schema';

describe('inquiry schema', () => {
  const base = {
    full_name: 'Dr Test',
    email: 'dr@test.co.za',
    phone: '+27 82 123 4567',
    hpcsa_number: 'MP1234567',
    province: 'Western Cape',
    city: 'Cape Town',
    requested_subscription_plan: 'SOLO' as const,
  };

  it('accepts all four subscription plans', () => {
    for (const plan of ['SOLO', 'SMALL_PRACTICE', 'CLINIC', 'ENTERPRISE'] as const) {
      const result = inquirySchema.safeParse({ ...base, requested_subscription_plan: plan });
      expect(result.success).toBe(true);
    }
  });

  it('requires province and free-text city', () => {
    const missingProvince = inquirySchema.safeParse({ ...base, province: undefined });
    expect(missingProvince.success).toBe(false);

    const shortCity = inquirySchema.safeParse({ ...base, city: 'A' });
    expect(shortCity.success).toBe(false);
  });

  it('does not require legacy practice_type', () => {
    const result = inquirySchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect('practice_type' in result.data).toBe(false);
    }
  });
});
