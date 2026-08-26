'use client';

import { Clock, Mail, MapPin, MessageCircle, Phone, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionReveal } from '@/components/marketing/section-reveal';
import type { PracticeInfo } from '@/lib/tenant';
import { phoneToTelHref, phoneToWhatsAppHref } from './practice-defaults';

interface PracticeLocationProps {
  practice: PracticeInfo;
}

export function PracticeLocation({ practice }: PracticeLocationProps) {
  const address = [
    practice.address_line1,
    [practice.city, practice.postal_code].filter(Boolean).join(', '),
    practice.province,
  ]
    .filter(Boolean)
    .join(', ');

  const tel = phoneToTelHref(practice.phone);
  const emergencyTel = phoneToTelHref(practice.emergency_phone);
  const wa = phoneToWhatsAppHref(practice.whatsapp || practice.phone);
  const directionsUrl = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : null;

  const hours = practice.office_hours || {
    monFri: '08:00 - 17:00',
    saturday: '09:00 - 13:00',
    sunday: 'Closed',
  };

  return (
    <section id="location" className="scroll-mt-16 bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionReveal>
          <h2 className="text-center text-3xl font-bold text-slate-900">Location & Contact</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-base font-medium text-primary">
            Visit us or get in touch — we are here to help.
          </p>
        </SectionReveal>

        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <SectionReveal className="min-w-0">
            <div className="min-w-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-100 shadow-sm">
              {practice.map_embed_url ? (
                <iframe
                  title="Practice location map"
                  src={practice.map_embed_url}
                  className="h-64 w-full border-0 lg:h-80"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              ) : (
                <div className="flex h-64 items-center justify-center bg-slate-100 lg:h-80">
                  <MapPin className="h-10 w-10 text-slate-400" />
                </div>
              )}
            </div>
            {address && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-primary bg-gradient-to-br from-primary/40 via-slate-50 to-primary/30 p-6">
                <p className="min-w-0 flex-1 text-sm text-slate-600">{address}</p>
                {directionsUrl && (
                  <Button asChild variant="outline" className="min-h-11 shrink-0 border-primary">
                    <a href={directionsUrl} target="_blank" rel="noreferrer">
                      Get Directions
                    </a>
                  </Button>
                )}
              </div>
            )}
          </SectionReveal>

          <SectionReveal delayMs={80} className="min-w-0">
            <div className="space-y-5 rounded-xl border border-slate-100 bg-gradient-to-b from-primary/40 via-slate-50 to-primary/30 p-6">
              {practice.phone && tel && (
                <a href={tel} className="flex items-center gap-3 text-slate-800 hover:text-slate-950">
                  <Phone className="h-5 w-5 text-primary" />
                  <span className="font-medium">{practice.phone}</span>
                </a>
              )}
              {wa && (
                <a
                  href={wa}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 text-slate-800 hover:text-slate-950"
                >
                  <MessageCircle className="h-5 w-5 text-primary" />
                  <span className="font-medium">WhatsApp us</span>
                </a>
              )}
              {practice.email && (
                <a
                  href={`mailto:${practice.email}`}
                  className="flex items-center gap-3 text-slate-800 hover:text-slate-950"
                >
                  <Mail className="h-5 w-5 text-primary" />
                  <span className="font-medium">{practice.email}</span>
                </a>
              )}

              <div className="border-t border-slate-200 pt-5">
                <div className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
                  <Clock className="h-5 w-5 text-primary" />
                  Hours
                </div>
                <dl className="space-y-2 text-sm text-slate-600">
                  <div className="flex justify-between gap-4">
                    <dt>Mon–Fri</dt>
                    <dd className="font-medium text-slate-800">{hours.monFri}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Saturday</dt>
                    <dd className="font-medium text-slate-800">{hours.saturday}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Sunday</dt>
                    <dd className="font-medium text-slate-800">{hours.sunday}</dd>
                  </div>
                </dl>
              </div>

              {(practice.emergency_phone || emergencyTel) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                  <div className="mb-1 flex items-center gap-2 font-semibold">
                    <AlertTriangle className="h-4 w-4" />
                    Emergency notice
                  </div>
                  <p>
                    For medical emergencies, please call{' '}
                    {emergencyTel ? (
                      <a href={emergencyTel} className="font-semibold underline">
                        {practice.emergency_phone}
                      </a>
                    ) : (
                      practice.emergency_phone
                    )}{' '}
                    or visit your nearest hospital.
                  </p>
                </div>
              )}
            </div>
          </SectionReveal>
        </div>
      </div>
    </section>
  );
}
