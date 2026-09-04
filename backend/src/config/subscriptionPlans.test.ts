import { describe, expect, it } from 'vitest';
import { SubscriptionPlan } from '@prisma/client';
import {
  SUBSCRIPTION_PLAN_DEFAULTS,
  assertPlanSeatLimit,
  planFromActiveDoctorCount,
  resolvePlanAgreement,
} from './subscriptionPlans';

describe('subscriptionPlans', () => {
  it('uses Solo defaults', () => {
    expect(resolvePlanAgreement({ plan: SubscriptionPlan.SOLO })).toEqual({
      subscriptionPlan: SubscriptionPlan.SOLO,
      doctorSeatLimit: 1,
      monthlyFeeCents: 99_900,
    });
    expect(SUBSCRIPTION_PLAN_DEFAULTS.SOLO.monthlyFeeCents).toBe(99_900);
    expect(SUBSCRIPTION_PLAN_DEFAULTS.SOLO.doctorSeatLimit).toBe(1);
  });

  it('uses Small Practice defaults', () => {
    expect(resolvePlanAgreement({ plan: SubscriptionPlan.SMALL_PRACTICE })).toEqual({
      subscriptionPlan: SubscriptionPlan.SMALL_PRACTICE,
      doctorSeatLimit: 3,
      monthlyFeeCents: 249_900,
    });
    expect(SUBSCRIPTION_PLAN_DEFAULTS.SMALL_PRACTICE.monthlyFeeCents).toBe(249_900);
    expect(SUBSCRIPTION_PLAN_DEFAULTS.SMALL_PRACTICE.doctorSeatLimit).toBe(3);
  });

  it('uses Clinic defaults', () => {
    expect(resolvePlanAgreement({ plan: SubscriptionPlan.CLINIC })).toEqual({
      subscriptionPlan: SubscriptionPlan.CLINIC,
      doctorSeatLimit: 5,
      monthlyFeeCents: 449_900,
    });
    expect(SUBSCRIPTION_PLAN_DEFAULTS.CLINIC.monthlyFeeCents).toBe(449_900);
    expect(SUBSCRIPTION_PLAN_DEFAULTS.CLINIC.doctorSeatLimit).toBe(5);
  });

  it('keeps Enterprise custom with no catalogue fee', () => {
    expect(SUBSCRIPTION_PLAN_DEFAULTS.ENTERPRISE.monthlyFeeCents).toBeNull();
    expect(SUBSCRIPTION_PLAN_DEFAULTS.ENTERPRISE.minSeats).toBe(6);
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
