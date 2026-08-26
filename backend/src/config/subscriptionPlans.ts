import { SubscriptionPlan } from '@prisma/client';

export interface SubscriptionPlanDefaults {
  plan: SubscriptionPlan;
  label: string;
  description: string;
  doctorSeatLimit: number;
  monthlyFeeCents: number | null;
  minSeats: number;
  maxSeats: number | null;
}

export const SUBSCRIPTION_PLAN_DEFAULTS: Record<SubscriptionPlan, SubscriptionPlanDefaults> = {
  SOLO: {
    plan: SubscriptionPlan.SOLO,
    label: 'Solo',
    description: '1 Doctor',
    doctorSeatLimit: 1,
    monthlyFeeCents: 80_000,
    minSeats: 1,
    maxSeats: 1,
  },
  SMALL_PRACTICE: {
    plan: SubscriptionPlan.SMALL_PRACTICE,
    label: 'Small Practice',
    description: 'Up to 3 Doctors',
    doctorSeatLimit: 3,
    monthlyFeeCents: 180_000,
    minSeats: 2,
    maxSeats: 3,
  },
  CLINIC: {
    plan: SubscriptionPlan.CLINIC,
    label: 'Clinic',
    description: 'Up to 5 Doctors',
    doctorSeatLimit: 5,
    monthlyFeeCents: 350_000,
    minSeats: 4,
    maxSeats: 5,
  },
  ENTERPRISE: {
    plan: SubscriptionPlan.ENTERPRISE,
    label: 'Enterprise',
    description: '6+ Doctors',
    doctorSeatLimit: 6,
    monthlyFeeCents: null,
    minSeats: 6,
    maxSeats: null,
  },
};

export function getPlanDefaults(plan: SubscriptionPlan): SubscriptionPlanDefaults {
  return SUBSCRIPTION_PLAN_DEFAULTS[plan];
}

export function resolvePlanAgreement(input: {
  plan: SubscriptionPlan;
  doctorSeatLimit?: number;
  monthlyFeeCents?: number;
}): { subscriptionPlan: SubscriptionPlan; doctorSeatLimit: number; monthlyFeeCents: number } {
  const defaults = getPlanDefaults(input.plan);

  if (input.plan === SubscriptionPlan.ENTERPRISE) {
    const doctorSeatLimit = input.doctorSeatLimit ?? defaults.doctorSeatLimit;
    if (doctorSeatLimit < defaults.minSeats) {
      throw new Error(`Enterprise requires at least ${defaults.minSeats} Doctor seats`);
    }
    const monthlyFeeCents = input.monthlyFeeCents;
    if (monthlyFeeCents == null || monthlyFeeCents <= 0) {
      throw new Error('Enterprise requires a configured monthly fee');
    }
    return {
      subscriptionPlan: input.plan,
      doctorSeatLimit,
      monthlyFeeCents,
    };
  }

  if (
    input.doctorSeatLimit != null &&
    input.doctorSeatLimit !== defaults.doctorSeatLimit
  ) {
    throw new Error(
      `${defaults.label} plan requires exactly ${defaults.doctorSeatLimit} Doctor seat${
        defaults.doctorSeatLimit === 1 ? '' : 's'
      }`
    );
  }

  return {
    subscriptionPlan: input.plan,
    doctorSeatLimit: defaults.doctorSeatLimit,
    monthlyFeeCents: input.monthlyFeeCents ?? defaults.monthlyFeeCents ?? 80_000,
  };
}

/**
 * Enforce fixed plan seat contracts on Super Admin writes.
 * SOLO=1, SMALL_PRACTICE=3, CLINIC=5, ENTERPRISE>=6. Rejects API bypass attempts.
 */
export function assertPlanSeatLimit(
  plan: SubscriptionPlan,
  doctorSeatLimit: number
): void {
  const defaults = getPlanDefaults(plan);
  if (plan === SubscriptionPlan.ENTERPRISE) {
    if (doctorSeatLimit < defaults.minSeats) {
      throw new Error(`Enterprise requires at least ${defaults.minSeats} Doctor seats`);
    }
    return;
  }
  if (doctorSeatLimit !== defaults.doctorSeatLimit) {
    throw new Error(
      `${defaults.label} plan requires exactly ${defaults.doctorSeatLimit} Doctor seat${
        defaults.doctorSeatLimit === 1 ? '' : 's'
      }`
    );
  }
}

export function planFromActiveDoctorCount(activeDoctorCount: number): {
  subscriptionPlan: SubscriptionPlan;
  doctorSeatLimit: number;
} {
  if (activeDoctorCount <= 1) {
    return { subscriptionPlan: SubscriptionPlan.SOLO, doctorSeatLimit: Math.max(1, activeDoctorCount) };
  }
  if (activeDoctorCount <= 3) {
    return {
      subscriptionPlan: SubscriptionPlan.SMALL_PRACTICE,
      doctorSeatLimit: Math.max(3, activeDoctorCount),
    };
  }
  if (activeDoctorCount <= 5) {
    return { subscriptionPlan: SubscriptionPlan.CLINIC, doctorSeatLimit: Math.max(5, activeDoctorCount) };
  }
  return {
    subscriptionPlan: SubscriptionPlan.ENTERPRISE,
    doctorSeatLimit: activeDoctorCount,
  };
}
