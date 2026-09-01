export const MARKETING_NAV = [
  { href: '/features', label: 'Features' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
] as const;

export const MARKETING_ONLY_PATHS = [
  '/features',
  '/pricing',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
] as const;

export function isMarketingOnlyPath(pathname: string): boolean {
  const path = pathname.replace(/\/$/, '') || '/';
  return MARKETING_ONLY_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

export function trialHref(plan?: string | null): string {
  if (plan) return `/contact?plan=${encodeURIComponent(plan)}`;
  return '/contact';
}

export function demoHref(plan?: string | null): string {
  if (plan) return `/contact?plan=${encodeURIComponent(plan)}&intent=demo`;
  return '/contact?intent=demo';
}
