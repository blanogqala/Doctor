import { MarketingShell } from '@/components/marketing/marketing-shell';
import { LegalPage } from '@/components/marketing/legal-page';
import { marketingMetadata } from '@/lib/marketing/seo';

export const metadata = marketingMetadata({
  title: 'Terms | MedSpace',
  description: 'Terms for using MedSpace practice software, trials and clinical responsibility.',
  path: '/terms',
});

export default function TermsPage() {
  return (
    <MarketingShell>
      <LegalPage title="Terms">
        <p>
          MedSpace is software for independent doctors and growing medical practices. Use of the
          product is subject to the agreement in place when a practice workspace is created.
        </p>
        <p>
          Public pricing describes monthly plan capacity (doctor seats). New practices may start
          with a 14-day trial. We do not charge a setup fee as part of the current offering.
        </p>
        <p>
          MedSpace does not provide medical advice. Clinical records and decisions remain the
          responsibility of the treating clinician. AI features draft documentation; they do not
          replace clinical judgement.
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
