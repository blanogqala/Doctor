'use client';

import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { ArrowRight, CheckCircle2, Shield, Zap } from 'lucide-react';

const trustBadges = [
  { icon: CheckCircle2, label: 'Built for SA Practices' },
  { icon: Shield, label: 'Privacy-Focused Controls' },
  { icon: Zap, label: 'Load Shedding Proof' },
];

export function HeroSection({ onRequestPortal }: { onRequestPortal?: () => void }) {
  const handleJoin = () => {
    if (onRequestPortal) onRequestPortal();
    else document.getElementById('join')?.scrollIntoView({ behavior: 'smooth' });
  };
  return (
    <section
      id="home"
      className="relative flex min-h-[100vh] min-h-[600px] items-center overflow-hidden"
    >
      <Image
        src="/marketing/hero.jpg"
        alt="Doctor using a tablet during a modern medical consultation"
        fill
        priority
        className="object-cover"
        sizes="100vw"
      />
      <div className="bg-hero-overlay absolute inset-0" />

      {/* Subtle medical-cross watermark pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M26 10h8v16h16v8H34v16h-8V34H10v-8h16V10z\' fill=\'%23ffffff\' fill-opacity=\'1\'/%3E%3C/svg%3E")',
        }}
        aria-hidden
      />

      {/* Gradient orbs */}
      <div
        className="pointer-events-none absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-teal-400/30 blur-3xl animate-orb-pulse"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-16 bottom-1/4 h-80 w-80 rounded-full bg-blue-500/25 blur-3xl animate-orb-pulse"
        style={{ animationDelay: '2s' }}
        aria-hidden
      />

      <div className="relative z-10 mx-auto grid w-full max-w-7xl items-center gap-12 px-4 py-28 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:px-8">
        <div>
          <div
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-sm font-medium text-white backdrop-blur-sm opacity-0 animate-hero-stagger"
            style={{ animationDelay: '0ms', animationFillMode: 'forwards' }}
          >
            <span className="flex h-2 w-2 rounded-full bg-teal-300" />
            Trusted by 50+ SA Doctors
          </div>

          <h1
            className="text-[2rem] font-bold tracking-[-0.02em] text-white opacity-0 animate-hero-stagger sm:text-5xl lg:text-[3.5rem] lg:leading-[1.1]"
            style={{ animationDelay: '100ms', animationFillMode: 'forwards' }}
          >
            Your Practice. Your Domain. Your Patients.
          </h1>

          <p
            className="mt-6 max-w-xl text-base leading-relaxed text-white/90 opacity-0 animate-hero-stagger sm:text-lg"
            style={{ animationDelay: '200ms', animationFillMode: 'forwards' }}
          >
            Join 50+ doctors across South Africa using MedSpace. Get your own branded portal,
            privacy-focused records, and seamless patient management — no IT team required.
          </p>

          <div
            className="mt-10 flex flex-wrap gap-4 opacity-0 animate-hero-stagger"
            style={{ animationDelay: '300ms', animationFillMode: 'forwards' }}
          >
            <Button
              size="lg"
              className="bg-accent text-white shadow-lg transition-transform hover:scale-[1.02] hover:bg-accent/90 hover:shadow-xl"
              onClick={handleJoin}
            >
              Join as a Doctor
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="hidden flex-col gap-4 lg:flex">
          {trustBadges.map((badge, i) => (
            <div
              key={badge.label}
              className="flex items-center gap-3 rounded-xl border border-white/20 bg-white/10 px-5 py-4 shadow-lg backdrop-blur-md opacity-0 animate-hero-stagger"
              style={{
                animationDelay: `${400 + i * 100}ms`,
                animationFillMode: 'forwards',
              }}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/90">
                <badge.icon className="h-5 w-5 text-white" />
              </div>
              <span className="font-semibold text-white">{badge.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
