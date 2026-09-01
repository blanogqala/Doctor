import Link from 'next/link';

export function MarketingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto bg-[color:var(--ms-navy)] text-slate-300">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-5 lg:px-8">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white/10 text-sm font-semibold text-white">
              M
            </span>
            <span className="text-base font-semibold text-white">MediNathi</span>
          </div>
          <p className="mt-4 max-w-xs text-sm text-slate-400">Modern practice software.</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-white">Product</p>
          <ul className="mt-4 space-y-2">
            <li>
              <Link href="/features" className="text-sm text-slate-400 hover:text-white">
                Features
              </Link>
            </li>
            <li>
              <Link href="/pricing" className="text-sm text-slate-400 hover:text-white">
                Pricing
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-white">Company</p>
          <ul className="mt-4 space-y-2">
            <li>
              <Link href="/about" className="text-sm text-slate-400 hover:text-white">
                About
              </Link>
            </li>
            <li>
              <Link href="/contact" className="text-sm text-slate-400 hover:text-white">
                Contact
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-white">Account</p>
          <ul className="mt-4 space-y-2">
            <li>
              <Link href="/super-admin/login" className="text-sm text-slate-400 hover:text-white">
                Sign in
              </Link>
            </li>
          </ul>
          <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-white">Legal</p>
          <ul className="mt-3 space-y-2">
            <li>
              <Link href="/privacy" className="text-sm text-slate-400 hover:text-white">
                Privacy
              </Link>
            </li>
            <li>
              <Link href="/terms" className="text-sm text-slate-400 hover:text-white">
                Terms
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-slate-500 sm:px-6 lg:px-8">
          © {year} MediNathi. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
