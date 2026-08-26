'use client';

import Link from 'next/link';
import { HeartPulse, Linkedin, Twitter, Facebook } from 'lucide-react';

const quickLinks = [
  { href: '#home', label: 'Home' },
  { href: '#features', label: 'Features' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
  { href: '#join', label: 'Contact' },
];

function scrollToHash(href: string) {
  const id = href.replace('#', '');
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}

export function MarketingFooter() {
  return (
    <footer className="mt-auto bg-slate-950 text-slate-300">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <HeartPulse className="h-5 w-5 text-white" />
            </div>
            <span className="font-display text-lg font-bold text-white">MedSpace</span>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            White-label practice management for South African doctors
          </p>
        </div>

        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-white">Quick Links</p>
          <ul className="mt-4 space-y-2">
            {quickLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToHash(link.href);
                  }}
                  className="text-sm text-slate-400 transition-colors hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-white">Contact</p>
          <p className="mt-4 text-sm text-slate-400">support@medspace.co.za</p>
          <p className="mt-1 text-sm text-slate-400">+27 XX XXX XXXX</p>
        </div>

        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-white">Follow Us</p>
          <div className="mt-4 flex gap-3">
            {[
              { icon: Linkedin, label: 'LinkedIn' },
              { icon: Twitter, label: 'Twitter' },
              { icon: Facebook, label: 'Facebook' },
            ].map(({ icon: Icon, label }) => (
              <a
                key={label}
                href="#"
                aria-label={label}
                className="flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
              >
                <Icon className="h-5 w-5" />
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-slate-800">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} MedSpace. All rights reserved.</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <a href="#" className="hover:text-slate-300">
              Privacy Policy
            </a>
            <a href="#" className="hover:text-slate-300">
              Terms of Service
            </a>
            <a href="#" className="hover:text-slate-300">
              Data Privacy
            </a>
            <Link
              href="/super-admin/login"
              className="ml-auto text-slate-600 hover:text-slate-400 sm:ml-4"
            >
              Super Admin
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
