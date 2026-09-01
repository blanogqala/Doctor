import { MarketingShell } from '@/components/marketing/marketing-shell';
import { LegalPage } from '@/components/marketing/legal-page';
import { marketingMetadata } from '@/lib/marketing/seo';

export const metadata = marketingMetadata({
  title: 'Privacy | MedSpace',
  description:
    'How MedSpace handles public inquiry information and role-based access in a practice workspace.',
  path: '/privacy',
});

export default function PrivacyPage() {
  return (
    <MarketingShell>
      <LegalPage title="Privacy">
        <p>
          MedSpace is an early-stage practice workspace. This page describes how we handle
          information you submit through the public website. It is not a certification of
          compliance with any particular statute.
        </p>
        <p>
          Inquiry forms collect contact and practice details so we can respond and, if you
          proceed, create a practice workspace. We do not sell this information.
        </p>
        <p>
          Once a practice is created, access is role-based and practice data is isolated from
          other practices. Audit logs record sensitive actions. AI transcription and drafts
          require patient consent and remain under clinician control.
        </p>
        <p>
          Questions:{' '}
          <a href="mailto:support@medspace.co.za" className="underline">
            support@medspace.co.za
          </a>
        </p>
      </LegalPage>
    </MarketingShell>
  );
}
