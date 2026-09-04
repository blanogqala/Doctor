import { describe, expect, it } from 'vitest';
import {
  SUBSCRIPTION_PLANS,
  inquiryTypeToPlan,
  planLabel,
  resolveInquiryPlanPrefill,
  formatInterestedPlanDisplay,
  formatPlanPrice,
} from './subscription-plans';

describe('subscription plan config', () => {
  it('centralizes commercial defaults', () => {
    expect(SUBSCRIPTION_PLANS.map((p) => p.plan)).toEqual([
      'SOLO',
      'SMALL_PRACTICE',
      'CLINIC',
      'ENTERPRISE',
    ]);
    expect(SUBSCRIPTION_PLANS[0].monthlyFeeCents).toBe(99_900);
    expect(SUBSCRIPTION_PLANS[1].monthlyFeeCents).toBe(249_900);
    expect(SUBSCRIPTION_PLANS[2].monthlyFeeCents).toBe(449_900);
    expect(SUBSCRIPTION_PLANS[3].monthlyFeeCents).toBeNull();
    expect(SUBSCRIPTION_PLANS[0].doctorSeatLimit).toBe(1);
    expect(SUBSCRIPTION_PLANS[1].doctorSeatLimit).toBe(3);
    expect(SUBSCRIPTION_PLANS[2].doctorSeatLimit).toBe(5);
    expect(SUBSCRIPTION_PLANS[3].doctorSeatLimit).toBe(6);
  });

  it('formats catalogue prices for marketing', () => {
    expect(formatPlanPrice('SOLO')).toEqual({ price: 'R999', period: '/month' });
    expect(formatPlanPrice('SMALL_PRACTICE')).toEqual({ price: 'R2,499', period: '/month' });
    expect(formatPlanPrice('CLINIC')).toEqual({ price: 'R4,499', period: '/month' });
    expect(formatPlanPrice('ENTERPRISE')).toEqual({ price: 'Custom', period: '' });
  });

  it('maps legacy inquiry types to subscription plans', () => {
    expect(inquiryTypeToPlan('SOLO')).toBe('SOLO');
    expect(inquiryTypeToPlan('SMALL_CLINIC')).toBeNull();
    expect(inquiryTypeToPlan('LARGE_CLINIC')).toBe('ENTERPRISE');
  });

  it('labels plans for display', () => {
    expect(planLabel('SMALL_PRACTICE')).toBe('Small Practice');
  });

  it('does not mark a plan as most popular', () => {
    expect(formatInterestedPlanDisplay('CLINIC')).toBe('Clinic · 5 Doctor seats');
  });
});

describe('resolveInquiryPlanPrefill', () => {
  it('prefills exact requested plan when present', () => {
    expect(
      resolveInquiryPlanPrefill({ requested_subscription_plan: 'SMALL_PRACTICE' })
    ).toBe('SMALL_PRACTICE');
    expect(resolveInquiryPlanPrefill({ requested_subscription_plan: 'CLINIC' })).toBe('CLINIC');
  });

  it('falls back to legacy practice_type only when requested plan is absent', () => {
    expect(resolveInquiryPlanPrefill({ practice_type: 'LARGE_CLINIC' })).toBe('ENTERPRISE');
    expect(
      resolveInquiryPlanPrefill({
        requested_subscription_plan: 'CLINIC',
        practice_type: 'SMALL_CLINIC',
      })
    ).toBe('CLINIC');
  });

  it('returns null when no plan signals exist', () => {
    expect(resolveInquiryPlanPrefill({})).toBeNull();
  });

  it('does not auto-map ambiguous legacy SMALL_CLINIC', () => {
    expect(formatInterestedPlanDisplay(null)).toBeNull();
    expect(inquiryTypeToPlan('SMALL_CLINIC')).toBeNull();
    expect(resolveInquiryPlanPrefill({ practice_type: 'SMALL_CLINIC' })).toBeNull();
  });

  it('formats interested plan display with seat count', () => {
    expect(formatInterestedPlanDisplay('SMALL_PRACTICE')).toBe(
      'Small Practice · 3 Doctor seats'
    );
    expect(formatInterestedPlanDisplay('ENTERPRISE')).toBe(
      'Enterprise · 6+ configured Doctors'
    );
  });
});
