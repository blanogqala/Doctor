import type { MetadataRoute } from 'next';
import { SITE_ORIGIN } from '@/lib/marketing/seo';

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ['/', '/features', '/pricing', '/about', '/contact', '/privacy', '/terms'];
  const lastModified = new Date();
  return paths.map((path) => ({
    url: `${SITE_ORIGIN}${path === '/' ? '' : path}`,
    lastModified,
  }));
}
