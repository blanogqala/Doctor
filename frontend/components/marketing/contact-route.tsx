'use client';

import { useEffect, useState } from 'react';
import { MarketingShell } from './marketing-shell';
import { JoinFormSection } from './join-form-section';
import { FaqSection } from './faq-section';
import { getSubscriptionPlan, type SubscriptionPlan } from '@/lib/subscription-plans';

export function ContactRoute({
  plan,
  intent,
}: {
  plan?: string | null;
  intent?: string | null;
}) {
  const initial = plan ? getSubscriptionPlan(plan)?.plan ?? null : null;
  const [requestedPlan, setRequestedPlan] = useState<SubscriptionPlan | null>(initial);

  useEffect(() => {
    setRequestedPlan(plan ? getSubscriptionPlan(plan)?.plan ?? null : null);
  }, [plan]);

  return (
    <MarketingShell>
      <JoinFormSection
        requestedPlan={requestedPlan}
        onRequestedPlanChange={setRequestedPlan}
        intent={intent}
      />
      <FaqSection
        questions={[
          'What happens during the trial?',
          'Can reception manage appointments?',
          'Does MediNathi support AI-assisted clinical notes?',
          'How does pricing work?',
        ]}
      />
    </MarketingShell>
  );
}
