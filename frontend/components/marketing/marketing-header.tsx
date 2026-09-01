'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { MARKETING_NAV, trialHref } from '@/lib/marketing/routes';

export function MarketingHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 border-b transition-colors duration-200',
        scrolled
          ? 'border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-md'
          : 'border-b-2 border-[#12A89D] bg-[color:var(--ms-canvas)] backdrop-blur-md'
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md focus-visible:outline-none"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-b from-[#2F63F5] to-[#12A89D] text-sm font-semibold text-white">
            M
          </span>
          <span className="text-base font-semibold tracking-tight text-[color:var(--ms-ink)]">
            MedSpace
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {MARKETING_NAV.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'text-[color:var(--ms-blue)]'
                    : 'text-[color:var(--ms-muted)] hover:text-[color:var(--ms-ink)]'
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Button variant="ghost" size="sm" className="text-[color:var(--ms-ink)]" asChild>
            <Link href="/super-admin/login">Sign in</Link>
          </Button>
          <Button
            size="sm"
            className="bg-[#2F63F5] text-white hover:bg-[#2F63F5]/90"
            asChild
          >
            <Link href={trialHref()}>Start free trial</Link>
          </Button>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11 lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[300px] font-marketing sm:w-[340px]">
            <SheetHeader>
              <SheetTitle className="text-left">MedSpace</SheetTitle>
            </SheetHeader>
            <nav className="mt-8 flex flex-col gap-1" aria-label="Mobile">
              {MARKETING_NAV.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-md px-3 py-3 text-base font-medium text-slate-700 hover:bg-slate-50"
                >
                  {link.label}
                </Link>
              ))}
              <Button variant="outline" className="mt-4 min-h-11" asChild>
                <Link href="/super-admin/login" onClick={() => setOpen(false)}>
                  Sign in
                </Link>
              </Button>
              <Button
                className="min-h-11 bg-[#2F63F5] text-white hover:bg-[#2F63F5]/90"
                asChild
              >
                <Link href={trialHref()} onClick={() => setOpen(false)}>
                  Start free trial
                </Link>
              </Button>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
