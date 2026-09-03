import { cache } from 'react';
import { getApiBaseUrl } from '@/lib/api';
import { fetchPublicPracticeInfo, type PracticeInfo } from '@/lib/public-practice-info';

/**
 * Request-scoped public practice branding for SSR theming.
 * Must not be imported from client components (uses React cache).
 */
export const getServerPublicPracticeInfo = cache(
  async (subdomain: string | null): Promise<PracticeInfo | null> => {
    if (!subdomain) return null;
    return fetchPublicPracticeInfo(subdomain, getApiBaseUrl(), { cache: 'no-store' });
  }
);
