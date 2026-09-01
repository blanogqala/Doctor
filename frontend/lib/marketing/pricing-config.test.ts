import { describe, expect, it } from 'vitest';
import {
  SUBSCRIPTION_PLANS,
  marketingPlanLabel,
  marketingSeatDescription,
  marketingAudienceLabel,
  formatPlanPrice,
  planFeaturesForMarketing,
  MARKETING_CORE_FEATURES,
  MARKETING_INCLUSION_STRIP,
} from '../subscription-plans';

describe('marketing pricing config', () => {
  it('derives four plans from shared subscription config', () => {
    expect(SUBSCRIPTION_PLANS).toHaveLength(4);
    expect(SUBSCRIPTION_PLANS.map((p) => marketingPlanLabel(p.plan))).toEqual([
      'Solo Practitioner',
      'Small Practice',
      'Clinic',
      'Enterprise',
    ]);
  });

  it('includes Small Practice and Clinic tiers', () => {
    const plans = SUBSCRIPTION_PLANS.map((p) => p.plan);
    expect(plans).toContain('SMALL_PRACTICE');
    expect(plans).toContain('CLINIC');
  });

  it('does not advertise unlimited doctors for Enterprise', () => {
    const enterpriseFeatures = planFeaturesForMarketing('ENTERPRISE');
    expect(enterpriseFeatures[0].toLowerCase()).not.toContain('unlimited');
    expect(marketingSeatDescription('ENTERPRISE')).toContain('configured');
    expect(marketingSeatDescription('ENTERPRISE').toLowerCase()).not.toContain('unlimited');
  });

  it('matches Phase 7 pricing', () => {
    expect(formatPlanPrice('SOLO')).toEqual({ price: 'R800', period: '/month' });
    expect(formatPlanPrice('SMALL_PRACTICE')).toEqual({ price: 'R1,800', period: '/month' });
    expect(formatPlanPrice('CLINIC')).toEqual({ price: 'R3,500', period: '/month' });
    expect(formatPlanPrice('ENTERPRISE')).toEqual({ price: 'Custom', period: '' });
  });

  it('uses accurate shared core features', () => {
    expect(MARKETING_CORE_FEATURES).toContain('Reception & staff access');
    expect(MARKETING_CORE_FEATURES).toContain('AI-assisted clinical documentation');
    expect(MARKETING_CORE_FEATURES).not.toContain('Unlimited patients');
  });

  it('uses audience labels instead of popularity badges', () => {
    expect(marketingAudienceLabel('SOLO')).toBe('For solo practitioners');
    expect(marketingAudienceLabel('CLINIC')).toBe('For growing clinics');
  });

  it('exposes a shared inclusion strip without per-plan feature lists in UI config', () => {
    expect(MARKETING_INCLUSION_STRIP).toContain('Patient folders');
    expect(MARKETING_INCLUSION_STRIP).toContain('Clinical Copilot');
  });
});
