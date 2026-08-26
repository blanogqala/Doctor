export type SubscriptionPlan = 'SOLO' | 'SMALL_PRACTICE' | 'CLINIC' | 'ENTERPRISE';

export interface SubscriptionPlanInfo {
  plan: SubscriptionPlan;
  label: string;
  description: string;
  doctorSeatLimit: number;
  monthlyFeeCents: number | null;
  minSeats: number;
}

export const SUBSCRIPTION_PLANS: SubscriptionPlanInfo[] = [
  {
    plan: 'SOLO',
    label: 'Solo',
    description: '1 Doctor',
    doctorSeatLimit: 1,
    monthlyFeeCents: 80_000,
    minSeats: 1,
  },
  {
    plan: 'SMALL_PRACTICE',
    label: 'Small Practice',
    description: 'Up to 3 Doctors',
    doctorSeatLimit: 3,
    monthlyFeeCents: 180_000,
    minSeats: 2,
  },
  {
    plan: 'CLINIC',
    label: 'Clinic',
    description: 'Up to 5 Doctors',
    doctorSeatLimit: 5,
    monthlyFeeCents: 350_000,
    minSeats: 4,
  },
  {
    plan: 'ENTERPRISE',
    label: 'Enterprise',
    description: '6+ Doctors',
    doctorSeatLimit: 6,
    monthlyFeeCents: null,
    minSeats: 6,
  },
];

export const HIGHLIGHTED_MARKETING_PLAN: SubscriptionPlan = 'CLINIC';

export const MARKETING_CORE_FEATURES = [
  'Reception & staff access',
  'Unlimited patients',
  'Practice portal & white-label branding',
  'Clinical records',
  'Telemedicine',
  'MedSpace AI Scribe',
  '14-day free trial',
] as const;

const MARKETING_LABELS: Record<SubscriptionPlan, string> = {
  SOLO: 'Solo Practitioner',
  SMALL_PRACTICE: 'Small Practice',
  CLINIC: 'Clinic',
  ENTERPRISE: 'Enterprise',
};

const MARKETING_SEAT_DESCRIPTIONS: Record<SubscriptionPlan, string> = {
  SOLO: '1 Doctor',
  SMALL_PRACTICE: 'Up to 3 Doctors',
  CLINIC: 'Up to 5 Doctors',
  ENTERPRISE: '6+ Doctors — configured seats',
};

const MARKETING_TAGLINES: Record<SubscriptionPlan, string> = {
  SOLO: 'Perfect for individual doctors starting out.',
  SMALL_PRACTICE: 'Ideal for growing practices with a small clinical team.',
  CLINIC: 'For practices with multiple clinicians.',
  ENTERPRISE: 'For larger groups with a configured seat agreement.',
};

export function getSubscriptionPlan(plan: string): SubscriptionPlanInfo | undefined {
  return SUBSCRIPTION_PLANS.find((p) => p.plan === plan);
}

export function planLabel(plan?: string | null): string {
  return getSubscriptionPlan(plan ?? '')?.label ?? plan ?? '—';
}

export function marketingPlanLabel(plan: SubscriptionPlan | string): string {
  return MARKETING_LABELS[plan as SubscriptionPlan] ?? plan;
}

export function marketingSeatDescription(plan: SubscriptionPlan | string): string {
  return MARKETING_SEAT_DESCRIPTIONS[plan as SubscriptionPlan] ?? '';
}

export function marketingTagline(plan: SubscriptionPlan): string {
  return MARKETING_TAGLINES[plan];
}

export function formatPlanPrice(plan: SubscriptionPlan): { price: string; period: string } {
  const info = getSubscriptionPlan(plan);
  if (!info || info.monthlyFeeCents == null) {
    return { price: 'Custom', period: '' };
  }
  const rands = info.monthlyFeeCents / 100;
  const formatted =
    rands >= 1000
      ? `R${Math.floor(rands).toLocaleString('en-US')}`
      : `R${rands}`;
  return {
    price: formatted,
    period: '/month',
  };
}

export function planFeaturesForMarketing(plan: SubscriptionPlan): string[] {
  return [marketingSeatDescription(plan), ...MARKETING_CORE_FEATURES];
}

export interface InquiryPlanPrefillInput {
  requested_subscription_plan?: string | null;
  practice_type?: string | null;
}

/** Resolve onboarding plan prefill — exact requested plan first, legacy fallback only when absent. */
export function resolveInquiryPlanPrefill(input: InquiryPlanPrefillInput): SubscriptionPlan | null {
  if (input.requested_subscription_plan) {
    const match = getSubscriptionPlan(input.requested_subscription_plan);
    if (match) return match.plan;
  }
  if (input.practice_type) {
    return inquiryTypeToPlan(input.practice_type);
  }
  return null;
}

/**
 * Legacy mapping — only for old inquiries without requested_subscription_plan.
 * SMALL_CLINIC (2–5 Doctors) is ambiguous between SMALL_PRACTICE and CLINIC → null.
 */
export function inquiryTypeToPlan(practiceType: string): SubscriptionPlan | null {
  switch (practiceType) {
    case 'SOLO':
      return 'SOLO';
    case 'SMALL_CLINIC':
      return null;
    case 'LARGE_CLINIC':
      return 'ENTERPRISE';
    default:
      return null;
  }
}

export function isLegacyAmbiguousInquiry(practiceType?: string | null): boolean {
  return practiceType === 'SMALL_CLINIC';
}

export function formatInterestedPlanDisplay(plan?: string | null): string | null {
  if (!plan) return null;
  const info = getSubscriptionPlan(plan);
  if (!info) return null;
  if (info.plan === 'ENTERPRISE') {
    return `${marketingPlanLabel(info.plan)} · 6+ configured Doctors`;
  }
  return `${marketingPlanLabel(info.plan)} · ${info.doctorSeatLimit} Doctor seat${info.doctorSeatLimit === 1 ? '' : 's'}`;
}
