import { describe, expect, it } from 'vitest';
import { SubscriptionPlan } from '@prisma/client';
import {
  assertPlanSeatLimit,
  planFromActiveDoctorCount,
  resolvePlanAgreement,
} from './subscriptionPlans';

describe('subscriptionPlans', () => {
  it('uses Solo defaults', () => {
    expect(resolvePlanAgreement({ plan: SubscriptionPlan.SOLO })).toEqual({
      subscriptionPlan: SubscriptionPlan.SOLO,
      doctorSeatLimit: 1,
      monthlyFeeCents: 80_000,
    });
  });

  it('requires Enterprise fee and min seats', () => {
    expect(() =>
      resolvePlanAgreement({ plan: SubscriptionPlan.ENTERPRISE, doctorSeatLimit: 10 })
    ).toThrow(/monthly fee/i);
    expect(() =>
      resolvePlanAgreement({
        plan: SubscriptionPlan.ENTERPRISE,
        doctorSeatLimit: 4,
        monthlyFeeCents: 500000,
      })
    ).toThrow(/at least 6/i);
    expect(
      resolvePlanAgreement({
        plan: SubscriptionPlan.ENTERPRISE,
        doctorSeatLimit: 10,
        monthlyFeeCents: 500000,
      })
    ).toEqual({
      subscriptionPlan: SubscriptionPlan.ENTERPRISE,
      doctorSeatLimit: 10,
      monthlyFeeCents: 500000,
    });
  });

  it('maps existing doctor counts without locking users out', () => {
    expect(planFromActiveDoctorCount(1)).toEqual({
      subscriptionPlan: SubscriptionPlan.SOLO,
      doctorSeatLimit: 1,
    });
    expect(planFromActiveDoctorCount(3).subscriptionPlan).toBe(SubscriptionPlan.SMALL_PRACTICE);
    expect(planFromActiveDoctorCount(7).doctorSeatLimit).toBe(7);
  });

  it('rejects fixed-plan seat mismatches', () => {
    expect(() => assertPlanSeatLimit(SubscriptionPlan.SOLO, 2)).toThrow(/exactly 1/i);
    expect(() => assertPlanSeatLimit(SubscriptionPlan.SMALL_PRACTICE, 10)).toThrow(/exactly 3/i);
    expect(() => assertPlanSeatLimit(SubscriptionPlan.CLINIC, 6)).toThrow(/exactly 5/i);
    expect(() => assertPlanSeatLimit(SubscriptionPlan.ENTERPRISE, 5)).toThrow(/at least 6/i);
    expect(() => assertPlanSeatLimit(SubscriptionPlan.ENTERPRISE, 10)).not.toThrow();
    expect(() => assertPlanSeatLimit(SubscriptionPlan.SOLO, 1)).not.toThrow();
  });
});
