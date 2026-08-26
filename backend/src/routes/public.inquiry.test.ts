import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('public inquiry route (source contract)', () => {
  const source = fs.readFileSync(path.join(__dirname, 'public.ts'), 'utf8');

  it('requires requested_subscription_plan on inquiry POST', () => {
    expect(source).toContain('requested_subscription_plan: z.nativeEnum(SubscriptionPlan)');
  });

  it('uses province and free-text city instead of SA city enum', () => {
    expect(source).toContain('province: z.enum(SA_PROVINCES)');
    expect(source).toContain('city: z.string().min(2)');
    expect(source).not.toMatch(/city: z\.enum\(SA_CITIES\)/);
  });

  it('does not require practice_type on create', () => {
    expect(source).not.toContain('practice_type: z.nativeEnum(PracticeType)');
  });
});
