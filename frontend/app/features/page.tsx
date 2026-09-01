import { FeaturesRoute } from '@/components/marketing/features-route';
import { marketingMetadata } from '@/lib/marketing/seo';

export const metadata = marketingMetadata({
  title: 'Features | MediNathi',
  description:
    'Appointments, patient folders, clinical documentation, reception workflows and patient access in one practice workspace.',
  path: '/features',
});

export default function FeaturesPage() {
  return <FeaturesRoute />;
}
