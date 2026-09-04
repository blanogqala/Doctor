// @vitest-environment jsdom

import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PracticeDoctorSummary } from '@/lib/tenant';
import {
  useDoctorSlide,
  type DoctorSlide,
  type DoctorSlideOptions,
} from './use-doctor-slide';

function makeDoctor(
  id: string,
  full_name: string,
  extra: Partial<PracticeDoctorSummary> = {}
): PracticeDoctorSummary {
  return {
    id,
    full_name,
    specialization: 'GP',
    consultation_fee_cents: 50000,
    telemedicine_fee_cents: 45000,
    bio: null,
    photo_url: null,
    credentials: [],
    hpcsa_registration_number: null,
    is_verified: true,
    ...extra,
  };
}

const doctors3 = [
  makeDoctor('a', 'Dr Alice'),
  makeDoctor('b', 'Dr Bob'),
  makeDoctor('c', 'Dr Cara'),
];

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

function renderSlide(doctors: PracticeDoctorSummary[], options?: DoctorSlideOptions) {
  const result: { current: DoctorSlide } = { current: null! };

  function Probe({
    list,
    opts,
  }: {
    list: PracticeDoctorSummary[];
    opts?: DoctorSlideOptions;
  }) {
    result.current = useDoctorSlide(list, opts);
    return null;
  }

  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root;
  act(() => {
    root = createRoot(container);
    root.render(createElement(Probe, { list: doctors, opts: options }));
  });

  return {
    result,
    rerender(next: PracticeDoctorSummary[], nextOptions?: DoctorSlideOptions) {
      act(() => {
        root.render(createElement(Probe, { list: next, opts: nextOptions ?? options }));
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('useDoctorSlide', () => {
  let view: ReturnType<typeof renderSlide> | undefined;

  beforeEach(() => {
    // React 18 act() requires this flag in jsdom.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    mockMatchMedia(false);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    view?.unmount();
    view = undefined;
    vi.useRealTimers();
  });

  it('is safe with zero doctors: no doctor, no controls, no autoplay', () => {
    view = renderSlide([], { autoplayMs: 7000 });
    expect(view.result.current.doctor).toBeUndefined();
    expect(view.result.current.showControls).toBe(false);
    advance(14000);
    expect(view.result.current.doctor).toBeUndefined();
    expect(view.result.current.index).toBe(0);
  });

  it('does not show controls or autoplay for a single doctor', () => {
    view = renderSlide([makeDoctor('solo', 'Dr Solo')], { autoplayMs: 7000 });
    expect(view.result.current.doctor?.full_name).toBe('Dr Solo');
    expect(view.result.current.showControls).toBe(false);
    expect(view.result.current.index).toBe(0);
    act(() => {
      view!.result.current.goNext();
      view!.result.current.goPrev();
    });
    advance(14000);
    expect(view.result.current.index).toBe(0);
    expect(view.result.current.doctor?.id).toBe('solo');
  });

  it('advances automatically after the configured delay', () => {
    view = renderSlide(doctors3, { autoplayMs: 7000 });
    expect(view.result.current.doctor?.id).toBe('a');
    advance(6999);
    expect(view.result.current.doctor?.id).toBe('a');
    advance(1);
    expect(view.result.current.doctor?.id).toBe('b');
  });

  it('wraps from last doctor back to first', () => {
    view = renderSlide(doctors3, { autoplayMs: 7000 });
    advance(7000);
    expect(view.result.current.doctor?.id).toBe('b');
    advance(7000);
    expect(view.result.current.doctor?.id).toBe('c');
    advance(7000);
    expect(view.result.current.doctor?.id).toBe('a');
  });

  it('goNext and goPrev wrap around', () => {
    view = renderSlide(doctors3, { autoplayMs: 7000 });
    act(() => {
      view!.result.current.goNext();
    });
    expect(view.result.current.doctor?.id).toBe('b');
    act(() => {
      view!.result.current.goPrev();
    });
    expect(view.result.current.doctor?.id).toBe('a');
    act(() => {
      view!.result.current.goPrev();
    });
    expect(view.result.current.doctor?.id).toBe('c');
  });

  it('manual Next resets the autoplay timer', () => {
    view = renderSlide(doctors3, { autoplayMs: 7000 });
    advance(4000);
    act(() => {
      view!.result.current.goNext();
    });
    expect(view.result.current.doctor?.id).toBe('b');
    advance(6000);
    expect(view.result.current.doctor?.id).toBe('b');
    advance(1000);
    expect(view.result.current.doctor?.id).toBe('c');
  });

  it('goTo jumps to a doctor and restarts autoplay', () => {
    view = renderSlide(doctors3, { autoplayMs: 7000 });
    act(() => {
      view!.result.current.goTo(2);
    });
    expect(view.result.current.doctor?.id).toBe('c');
    advance(6999);
    expect(view.result.current.doctor?.id).toBe('c');
    advance(1);
    expect(view.result.current.doctor?.id).toBe('a');
  });

  it('keeps the index valid when the doctor list shrinks', () => {
    view = renderSlide(doctors3, { autoplayMs: 7000 });
    act(() => {
      view!.result.current.goTo(2);
    });
    expect(view.result.current.index).toBe(2);
    view.rerender(doctors3.slice(0, 2), { autoplayMs: 7000 });
    expect(view.result.current.index).toBe(0);
    expect(view.result.current.doctor?.id).toBe('a');
  });

  it('disables autoplay when reduced motion is preferred', () => {
    mockMatchMedia(true);
    view = renderSlide(doctors3, { autoplayMs: 7000 });
    advance(14000);
    expect(view.result.current.doctor?.id).toBe('a');
    act(() => {
      view!.result.current.goNext();
    });
    expect(view.result.current.doctor?.id).toBe('b');
  });

  it('pause blocks autoplay and resume restarts a full delay', () => {
    view = renderSlide(doctors3, { autoplayMs: 7000 });
    act(() => {
      view!.result.current.pause();
    });
    advance(14000);
    expect(view.result.current.doctor?.id).toBe('a');
    act(() => {
      view!.result.current.resume();
    });
    advance(6999);
    expect(view.result.current.doctor?.id).toBe('a');
    advance(1);
    expect(view.result.current.doctor?.id).toBe('b');
  });

  it('pause sources are independent so one resume does not unpause another', () => {
    view = renderSlide(doctors3, { autoplayMs: 7000 });
    act(() => {
      view!.result.current.pause('hero-hover');
      view!.result.current.pause('about-focus');
    });
    act(() => {
      view!.result.current.resume('hero-hover');
    });
    advance(7000);
    expect(view.result.current.doctor?.id).toBe('a');
    act(() => {
      view!.result.current.resume('about-focus');
    });
    advance(7000);
    expect(view.result.current.doctor?.id).toBe('b');
  });
});
