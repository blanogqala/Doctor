'use client';

import Link from 'next/link';
import { HeartPulse } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isNavItemActive, type NavItem } from '@/lib/navigation';
import { PracticeLogo } from '@/components/practice/practice-logo';

export interface AppBrand {
  title: string;
  subtitle: string;
  homeHref: string;
  logoSrc?: string | null;
  /** Fallback icon when no logo (defaults to HeartPulse) */
  fallbackIcon?: React.ComponentType<{ className?: string }>;
}

interface AppNavListProps {
  items: NavItem[];
  pathname: string;
  roleBasePath?: string;
  unreadCount?: number;
  messageHrefs?: Set<string>;
  onNavigate?: () => void;
  className?: string;
  variant?: 'default' | 'platform';
}

export function AppNavList({
  items,
  pathname,
  roleBasePath,
  unreadCount = 0,
  messageHrefs,
  onNavigate,
  className,
  variant = 'default',
}: AppNavListProps) {
  const isPlatform = variant === 'platform';
  return (
    <nav className={cn('flex-1 space-y-1 overflow-y-auto p-3 scrollbar-thin', className)} aria-label="Primary">
      {items.map((item) => {
        const isActive = isNavItemActive(pathname, item.href, roleBasePath);
        const isMessages = messageHrefs?.has(item.href);
        const showBadge = Boolean(isMessages && unreadCount > 0);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isPlatform
                ? isActive
                  ? 'bg-indigo-500 text-white shadow-soft'
                  : 'text-indigo-200/80 hover:bg-indigo-900/60 hover:text-white'
                : isActive
                  ? 'bg-primary text-primary-foreground shadow-soft'
                  : 'text-muted-foreground hover:bg-primary-soft hover:text-foreground'
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon className="h-4 w-4 flex-shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {showBadge && (
              <span
                className={cn(
                  'flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold',
                  isActive
                    ? 'bg-primary-foreground text-primary'
                    : 'bg-primary text-primary-foreground'
                )}
                aria-label={`${unreadCount} unread messages`}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

interface BrandMarkProps {
  brand: AppBrand;
  size?: 'sm' | 'md';
  className?: string;
  variant?: 'default' | 'platform';
}

export function BrandMark({ brand, size = 'md', className, variant = 'default' }: BrandMarkProps) {
  const Icon = brand.fallbackIcon ?? HeartPulse;
  const box = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9';
  const isPlatform = variant === 'platform';

  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <PracticeLogo
        src={brand.logoSrc}
        size="sm"
        className={cn(box, 'rounded-md bg-muted')}
        fallbackClassName={cn(
          box,
          'rounded-lg shadow-soft',
          isPlatform ? 'bg-indigo-500 text-white' : 'bg-primary text-primary-foreground'
        )}
        fallbackIcon={Icon}
      />
      <div className="flex min-w-0 flex-col">
        <span
          className={cn('truncate text-sm font-semibold', isPlatform ? 'text-white' : 'text-foreground')}
          title={brand.title}
        >
          {brand.title}
        </span>
        {size === 'md' && (
          <span className={cn('truncate text-xs', isPlatform ? 'text-indigo-200/70' : 'text-muted-foreground')}>
            {brand.subtitle}
          </span>
        )}
      </div>
    </div>
  );
}

export function BrandLink({
  brand,
  size = 'md',
  variant = 'default',
}: {
  brand: AppBrand;
  size?: 'sm' | 'md';
  variant?: 'default' | 'platform';
}) {
  return (
    <Link href={brand.homeHref} className="min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <BrandMark brand={brand} size={size} variant={variant} />
      <span className="sr-only">{brand.title}</span>
    </Link>
  );
}
