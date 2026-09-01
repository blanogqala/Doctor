import { PricingRoute } from '@/components/marketing/pricing-route';
import { marketingMetadata } from '@/lib/marketing/seo';

export const metadata = marketingMetadata({
  title: 'Pricing | MediNathi',
  description:
    'Simple monthly pricing for solo doctors, small practices, clinics and larger teams. 14-day trial. No setup fees.',
  path: '/pricing',
});

export default function PricingPage() {
  return <PricingRoute />;
}
