import { ContactRoute } from '@/components/marketing/contact-route';
import { marketingMetadata } from '@/lib/marketing/seo';

export const metadata = marketingMetadata({
  title: 'Contact | MediNathi',
  description: 'Request a demo or start a 14-day trial inquiry for your practice.',
  path: '/contact',
});

export default function ContactPage({
  searchParams,
}: {
  searchParams: { plan?: string; intent?: string };
}) {
  return <ContactRoute plan={searchParams.plan} intent={searchParams.intent} />;
}
