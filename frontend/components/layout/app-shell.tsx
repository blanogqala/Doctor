'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { AppNavList, BrandLink, type AppBrand } from '@/components/layout/app-nav';
import { MESSAGES_HREFS, type NavItem } from '@/lib/navigation';
import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface AppShellUser {
  name: string;
  email?: string | null;
  badge?: React.ReactNode;
  profileHref?: string;
}

export interface AppShellProps {
  brand: AppBrand;
  navItems: NavItem[];
  /** Base path for role home (e.g. /doctor) so nested routes don't keep home active */
  roleBasePath?: string;
  user: AppShellUser;
  onSignOut: () => void;
  unreadCount?: number;
  banner?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Platform admin receives a distinct deep-navy sidebar identity */
  variant?: 'default' | 'platform';
}

export function AppShell({
  brand,
  navItems,
  roleBasePath,
  user,
  onSignOut,
  unreadCount = 0,
  banner,
  children,
  className,
  variant = 'default',
}: AppShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navId = useId();
  const isPlatform = variant === 'platform';

  const sidebarSurface = isPlatform
    ? 'border-indigo-900/40 bg-[hsl(228_45%_16%)] text-indigo-50 shadow-elevated'
    : 'border-border/80 bg-card/95 shadow-soft backdrop-blur-xl';
  const sidebarHeaderBorder = isPlatform ? 'border-indigo-800/50' : 'border-border/70';
  const accountBorder = isPlatform ? 'border-indigo-800/50' : 'border-border/70';

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const profileHref = user.profileHref;

  const accountBlock = (
    <div className={cn('border-t p-3', accountBorder)}>
      {profileHref ? (
        <Link
          href={profileHref}
          onClick={() => setMobileOpen(false)}
          className={cn(
            'flex items-center gap-3 rounded-lg p-2 transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            pathname === profileHref ? 'bg-primary-soft' : 'hover:bg-muted'
          )}
        >
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary-soft text-primary">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
            {user.badge && <div className="mt-0.5">{user.badge}</div>}
            {!user.badge && user.email && (
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            )}
          </div>
        </Link>
      ) : (
        <div className="flex items-center gap-3 rounded-lg p-2">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary-soft text-primary">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
            {user.email && (
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            )}
          </div>
        </div>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={onSignOut}
        className="mt-2 w-full justify-start text-muted-foreground hover:text-foreground"
      >
        <LogOut className="mr-2 h-4 w-4" aria-hidden />
        Sign Out
      </Button>
    </div>
  );

  const desktopSidebar = (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r print:hidden lg:flex',
        sidebarSurface
      )}
      aria-label="Application sidebar"
    >
      <div className={cn('flex h-[4.25rem] items-center border-b px-4', sidebarHeaderBorder)}>
        <BrandLink brand={brand} variant={variant} />
      </div>
      <AppNavList
        items={navItems}
        pathname={pathname}
        roleBasePath={roleBasePath}
        unreadCount={unreadCount}
        messageHrefs={MESSAGES_HREFS}
        variant={variant}
      />
      {accountBlock}
    </aside>
  );

  return (
    <div className={cn('app-surface flex min-h-screen bg-background', className)}>
      {desktopSidebar}

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="flex w-[min(100%,18rem)] flex-col gap-0 p-0 lg:hidden"
          id={navId}
          aria-describedby={undefined}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription>Primary application navigation</SheetDescription>
          </SheetHeader>
          <div className="flex h-[4.25rem] items-center border-b border-border/70 px-4 pr-12">
            <BrandLink brand={brand} variant={variant} />
          </div>
          <AppNavList
            items={navItems}
            pathname={pathname}
            roleBasePath={roleBasePath}
            unreadCount={unreadCount}
            messageHrefs={MESSAGES_HREFS}
            onNavigate={() => setMobileOpen(false)}
          />
          {accountBlock}
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border/70 bg-card/90 px-3 backdrop-blur-xl safe-pb print:hidden sm:px-4 lg:hidden">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            aria-expanded={mobileOpen}
            aria-controls={navId}
            aria-label="Open navigation menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" aria-hidden />
          </Button>
          <div className="flex min-w-0 flex-1 justify-center">
            <BrandLink brand={brand} size="sm" variant={variant} />
          </div>
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-primary-soft text-xs text-primary">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
        </header>

        {banner}

        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
