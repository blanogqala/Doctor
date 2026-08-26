'use client';

import Link from 'next/link';
import { Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatSlotLabel } from './practice-defaults';

interface PracticeQuickBookBarProps {
  slots: Array<{ start: string; end: string }>;
  bookHref: string;
  loading?: boolean;
  bookingAvailable?: boolean;
}

export function PracticeQuickBookBar({
  slots,
  bookHref,
  loading,
  bookingAvailable = true,
}: PracticeQuickBookBarProps) {
  const next = slots[0];
  const unavailableMessage =
    'Online booking is temporarily unavailable. Please contact the Practice directly.';

  if (!bookingAvailable) {
    return (
      <>
        <section id="book" className="hidden border-b-2 border-primary bg-primary/10 md:block">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-4 sm:px-6">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <p className="text-sm font-medium text-slate-800">{unavailableMessage}</p>
          </div>
        </section>
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(15,23,42,0.08)] md:hidden">
          <p className="text-center text-sm font-medium text-slate-800">{unavailableMessage}</p>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Desktop horizontal bar — normal document flow */}
      <section id="book" className="hidden border-b-2 border-primary bg-primary/10 md:block">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">
                {loading
                  ? 'Checking availability…'
                  : next
                    ? `Next available: ${formatSlotLabel(next.start)}`
                    : 'Book online — choose a time that works for you'}
              </p>
              {slots.length > 1 && (
                <div className="mt-1 flex flex-wrap gap-2">
                  {slots.slice(0, 3).map((slot) => (
                    <Link
                      key={slot.start}
                      href={`${bookHref}${bookHref.includes('?') ? '&' : '?'}intent=book`}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-primary/40 hover:text-primary"
                    >
                      {formatSlotLabel(slot.start)}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
          <Button asChild className="min-h-11 shrink-0 bg-primary px-6 font-semibold text-primary-foreground hover:bg-primary/90">
            <Link href={bookHref}>Book Now</Link>
          </Button>
        </div>
      </section>

      {/* Mobile sticky bottom bar only below md */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(15,23,42,0.08)] md:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-1 sm:px-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-slate-500">Next available</p>
            <p className="truncate text-sm font-semibold text-slate-900">
              {loading ? 'Loading…' : next ? formatSlotLabel(next.start) : 'Open booking'}
            </p>
          </div>
          <Button asChild className="min-h-11 shrink-0 bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary/90">
            <Link href={bookHref}>Book Now</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
