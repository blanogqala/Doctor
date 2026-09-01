import { AboutRoute } from '@/components/marketing/about-route';
import { marketingMetadata } from '@/lib/marketing/seo';

export const metadata = marketingMetadata({
  title: 'About | MedSpace',
  description:
    'MedSpace is an early-stage product building a modern workspace for independent doctors and growing medical practices.',
  path: '/about',
});

export default function AboutPage() {
  return <AboutRoute />;
}
