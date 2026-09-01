'use client';

import Link from 'next/link';
import { Stethoscope } from 'lucide-react';
import type { PracticeInfo } from '@/lib/tenant';

interface PracticeFooterProps {
  practice: PracticeInfo;
  logoSrc: string | null;
}

export function PracticeFooter({ practice, logoSrc }: PracticeFooterProps) {
  const year = new Date().getFullYear();

  const links = [
    { href: '#top', label: 'Home' },
    { href: '#book', label: 'Book' },
    { href: '#services', label: 'Services' },
    { href: '#about', label: 'About' },
    { href: '#location', label: 'Contact' },
    { href: '#', label: 'Privacy Policy' },
  ];

  return (
    <footer className="border-t border-slate-200 bg-slate-900 text-slate-300">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 md:flex-row md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            {logoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoSrc} alt="" className="h-10 w-10 rounded bg-white object-contain p-1" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                <Stethoscope className="h-5 w-5 text-primary-foreground" />
              </div>
            )}
            <p className="font-semibold text-white">{practice.clinic_name}</p>
          </div>
          <p className="mt-4 text-sm text-slate-400">
            © {year} {practice.clinic_name}. All rights reserved.
          </p>
        </div>

        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {links.map((link) =>
            link.href.startsWith('#') ? (
              <a key={link.href} href={link.href} className="hover:text-white">
                {link.label}
              </a>
            ) : (
              <Link key={link.href} href={link.href} className="hover:text-white">
                {link.label}
              </Link>
            )
          )}
        </nav>
      </div>

      <div className="border-t border-slate-800 py-4 text-center text-xs text-slate-500">
        <a
          href="https://MediNathi.co.za"
          target="_blank"
          rel="noreferrer"
          className="hover:text-slate-300"
        >
          Powered by MediNathi
        </a>
      </div>
    </footer>
  );
}
