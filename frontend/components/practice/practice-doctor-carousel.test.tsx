// @vitest-environment jsdom

import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PracticeDoctorSummary, PracticeInfo } from '@/lib/tenant';
import { useDoctorSlide } from './use-doctor-slide';
import { PracticeHero } from './practice-hero';
import { PracticeAbout } from './practice-about';
import { DOCTOR_CAROUSEL_FRAME_CLASS, DOCTOR_CAROUSEL_NAV_CLASS } from './doctor-carousel-controls';

vi.mock('next/link', async () => {
  const React = await import('react');
  return {
    default: ({
      href,
      children,
      ...rest
    }: {
      href: string;
      children?: React.ReactNode;
    }) => React.createElement('a', { href, ...rest }, children),
  };
});

function makeDoctor(
  id: string,
  full_name: string,
  extra: Partial<PracticeDoctorSummary> = {}
): PracticeDoctorSummary {
  return {
    id,
    full_name,
    specialization: extra.specialization ?? `${full_name} spec`,
    consultation_fee_cents: 50000,
    telemedicine_fee_cents: 45000,
    bio: extra.bio ?? `${full_name} bio`,
    photo_url: extra.photo_url ?? null,
    credentials: extra.credentials ?? [],
    hpcsa_registration_number: extra.hpcsa_registration_number ?? null,
    is_verified: extra.is_verified ?? true,
    ...extra,
  };
}

function makePractice(doctors: PracticeDoctorSummary[]): PracticeInfo {
  return {
    id: 'prac-1',
    subdomain: 'demo',
    clinic_name: 'Demo Clinic',
    logo_url: null,
    brand_color: '#1E40AF',
    tagline: 'Care nearby',
    phone: null,
    email: null,
    whatsapp: null,
    address_line1: null,
    city: 'Cape Town',
    province: 'Western Cape',
    postal_code: null,
    map_embed_url: null,
    emergency_phone: null,
    office_hours: null,
    landing_services: null,
    services_intro: null,
    subscription_status: 'active',
    trial_ends_at: null,
    booking_available: true,
    doctors,
  };
}

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-reduced-motion: reduce') ? matches : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

function mockIntersectionObserver() {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
      root = null;
      rootMargin = '';
      thresholds: number[] = [];
    }
  );
}

function Harness({ doctors }: { doctors: PracticeDoctorSummary[] }) {
  const doctorSlide = useDoctorSlide(doctors, { autoplayMs: 7000 });
  return createElement(
    'div',
    null,
    createElement(PracticeHero, {
      practice: makePractice(doctors),
      logoSrc: null,
      bookHref: '/register',
      isLoggedIn: false,
      hasSlots: false,
      doctorSlide,
    }),
    createElement(PracticeAbout, { doctorSlide })
  );
}

function renderHarness(doctors: PracticeDoctorSummary[]) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root;
  act(() => {
    root = createRoot(container);
    root.render(createElement(Harness, { doctors }));
  });
  return {
    container,
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function heroName(container: HTMLElement) {
  return container.querySelector('#top p.mt-2')?.textContent ?? '';
}

function aboutHeading(container: HTMLElement) {
  return container.querySelector('#about h2')?.textContent ?? '';
}

describe('Practice doctor carousel (Hero + About)', () => {
  let view: ReturnType<typeof renderHarness> | undefined;

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    mockMatchMedia(false);
    mockIntersectionObserver();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    view?.unmount();
    view = undefined;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('is safe with zero doctors and shows no carousel controls', () => {
    view = renderHarness([]);
    expect(view.container.querySelector('#top')).not.toBeNull();
    expect(view.container.querySelector('#about')).toBeNull();
    expect(view.container.querySelector('[aria-label="Previous doctor"]')).toBeNull();
    expect(view.container.querySelector('[aria-label="Next doctor"]')).toBeNull();
    expect(view.container.querySelector('[aria-label^="Show Dr "]')).toBeNull();
    expect(view.container.textContent).toContain('Your doctor');
  });

  it('hides arrows and dots for a single doctor', () => {
    view = renderHarness([makeDoctor('solo', 'Dr Solo')]);
    expect(heroName(view.container)).toContain('Dr Solo');
    expect(aboutHeading(view.container)).toBe('Meet Dr Solo');
    expect(view.container.querySelector('[aria-label="Previous doctor"]')).toBeNull();
    expect(view.container.querySelector('[aria-label="Next doctor"]')).toBeNull();
    expect(view.container.querySelector('[aria-label^="Show Dr "]')).toBeNull();
  });

  it('keeps Hero and About on the same doctor after autoplay', () => {
    const doctors = [
      makeDoctor('a', 'Dr Alice'),
      makeDoctor('b', 'Dr Bob'),
      makeDoctor('c', 'Dr Cara'),
    ];
    view = renderHarness(doctors);
    expect(heroName(view.container)).toContain('Dr Alice');
    expect(aboutHeading(view.container)).toBe('Meet Dr Alice');
    act(() => {
      vi.advanceTimersByTime(7000);
    });
    expect(heroName(view.container)).toContain('Dr Bob');
    expect(aboutHeading(view.container)).toBe('Meet Dr Bob');
  });

  it('updates About when Hero Next is clicked', () => {
    const doctors = [makeDoctor('a', 'Dr Alice'), makeDoctor('b', 'Dr Bob')];
    view = renderHarness(doctors);
    const nextButtons = view.container.querySelectorAll<HTMLButtonElement>(
      '[aria-label="Next doctor"]'
    );
    expect(nextButtons.length).toBe(2);
    act(() => {
      nextButtons[0].click();
    });
    expect(heroName(view.container)).toContain('Dr Bob');
    expect(aboutHeading(view.container)).toBe('Meet Dr Bob');
  });

  it('updates Hero when About Next is clicked', () => {
    const doctors = [makeDoctor('a', 'Dr Alice'), makeDoctor('b', 'Dr Bob')];
    view = renderHarness(doctors);
    const nextButtons = view.container.querySelectorAll<HTMLButtonElement>(
      '[aria-label="Next doctor"]'
    );
    act(() => {
      nextButtons[1].click();
    });
    expect(heroName(view.container)).toContain('Dr Bob');
    expect(aboutHeading(view.container)).toBe('Meet Dr Bob');
  });

  it('uses primary theme tokens on arrow buttons and image frames', () => {
    const doctors = [makeDoctor('a', 'Dr Alice'), makeDoctor('b', 'Dr Bob')];
    view = renderHarness(doctors);
    const prev = view.container.querySelector('[aria-label="Previous doctor"]');
    expect(prev?.className).toContain('bg-primary');
    expect(prev?.className).toContain('text-primary-foreground');
    expect(prev?.className).toContain('border-primary');
    expect(DOCTOR_CAROUSEL_NAV_CLASS).toContain('bg-primary');
    expect(DOCTOR_CAROUSEL_NAV_CLASS).toContain('text-primary-foreground');
    expect(DOCTOR_CAROUSEL_NAV_CLASS).toContain('border-primary');

    const frames = view.container.querySelectorAll('.border-2.border-primary');
    expect(frames.length).toBeGreaterThanOrEqual(2);
    expect(DOCTOR_CAROUSEL_FRAME_CLASS).toBe('border-2 border-primary');
  });

  it('does not introduce hardcoded brand hex colours in carousel files', () => {
    const files = [
      'use-doctor-slide.ts',
      'practice-landing.tsx',
      'practice-hero.tsx',
      'practice-about.tsx',
      'doctor-carousel-controls.tsx',
    ];
    for (const file of files) {
      const src = readFileSync(path.join(__dirname, file), 'utf8');
      expect(src, file).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    }
  });

  it('preserves DoctorPhoto themed Stethoscope fallbacks when photos are missing', () => {
    view = renderHarness([
      makeDoctor('a', 'Dr Alice', { photo_url: null }),
      makeDoctor('b', 'Dr Bob', { photo_url: null }),
    ]);
    expect(view.container.querySelector('img')).toBeNull();
    expect(view.container.querySelectorAll('svg').length).toBeGreaterThan(0);
    expect(view.container.textContent).toContain('Dr Alice');
    expect(aboutHeading(view.container)).toBe('Meet Dr Alice');
  });
});
