'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { HeartPulse, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '#home', label: 'Home', id: 'home' },
  { href: '#features', label: 'Features', id: 'features' },
  { href: '#pricing', label: 'Pricing', id: 'pricing' },
  { href: '#faq', label: 'FAQ', id: 'faq' },
  { href: '#join', label: 'Contact', id: 'join' },
] as const;

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}

export function MarketingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState('home');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 100);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const sectionIds = NAV_LINKS.map((l) => l.id);
    const observers: IntersectionObserver[] = [];

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActive(id);
        },
        { rootMargin: '-40% 0px -50% 0px', threshold: 0 }
      );
      observer.observe(el);
      observers.push(observer);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, []);

  const onNavClick = (id: string) => {
    scrollToId(id);
    setOpen(false);
  };

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300',
        scrolled
          ? 'border-b border-slate-200/80 bg-white/85 shadow-sm backdrop-blur-md'
          : 'bg-transparent'
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            onNavClick('home');
          }}
          className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
        >
          <div
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
              scrolled ? 'bg-primary' : 'bg-white/20'
            )}
          >
            <HeartPulse className="h-5 w-5 text-white" />
          </div>
          <span
            className={cn(
              'font-display text-lg font-bold tracking-tight transition-colors',
              scrolled ? 'text-slate-900' : 'text-white'
            )}
          >
            MedSpace
          </span>
        </a>

        <nav className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.id}
              href={link.href}
              onClick={(e) => {
                e.preventDefault();
                onNavClick(link.id);
              }}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary',
                scrolled
                  ? active === link.id
                    ? 'text-secondary'
                    : 'text-slate-600 hover:text-secondary'
                  : active === link.id
                    ? 'text-white'
                    : 'text-white/80 hover:text-white',
                active === link.id && 'underline decoration-secondary decoration-2 underline-offset-8'
              )}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              scrolled
                ? 'text-accent hover:bg-slate-300 hover:text-accent'
                : 'text-accent hover:bg-white hover:text-accent'
            )}
            asChild
          >
            <Link href="/super-admin/login">Admin Login</Link>
          </Button>
          <Button
            size="sm"
            className={cn(
              'transition-transform hover:scale-[1.02]',
              scrolled
                ? 'bg-accent text-white hover:bg-accent/90'
                : 'bg-accent text-white hover:bg-accent/90'
            )}
            onClick={() => onNavClick('join')}
          >
            Join as a Doctor
          </Button>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'lg:hidden',
                scrolled ? 'text-slate-900' : 'text-white hover:bg-white/10 hover:text-white'
              )}
              aria-label="Open menu"
            >
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[300px] sm:w-[340px]">
            <SheetHeader>
              <SheetTitle className="font-display text-left">MedSpace</SheetTitle>
            </SheetHeader>
            <nav className="mt-8 flex flex-col gap-1">
              {NAV_LINKS.map((link) => (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => onNavClick(link.id)}
                  className={cn(
                    'rounded-md px-3 py-3 text-left text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary',
                    active === link.id
                      ? 'bg-secondary/10 text-secondary'
                      : 'text-slate-700 hover:bg-slate-50'
                  )}
                >
                  {link.label}
                </button>
              ))}
              <Button
                variant="outline"
                className="mt-4"
                asChild
              >
                <Link href="/super-admin/login" onClick={() => setOpen(false)}>
                  Super Admin
                </Link>
              </Button>
              <Button
                className="bg-accent text-white hover:bg-accent/90"
                onClick={() => onNavClick('join')}
              >
                Join as a Doctor
              </Button>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
