'use client';

import {
  POSTER_PITCH,
  POSTER_PLACEMENTS,
  type PosterGlyphId,
  type PosterPlacement,
  type PosterVariant,
} from '@/lib/theme/auth-poster-layout';
import { cn } from '@/lib/utils';

/**
 * Medical-poster auth wallpaper.
 *
 * The <svg> intentionally has no viewBox, so one SVG user unit equals one CSS
 * pixel and `patternUnits="userSpaceOnUse"` tiles at a fixed pixel pitch at any
 * viewport size. Nothing is cropped or distorted, and the decorative band is
 * simply whatever the centered auth panel does not cover.
 *
 * Placement lives in `@/lib/theme/auth-poster-layout`, which guarantees glyphs
 * never overlap and is unit-tested for that invariant.
 */

type GlyphKind = 'shape' | 'line';

interface Glyph {
  kind: GlyphKind;
  /** Closed silhouette for `shape`, stroked outline for `line`. */
  body: string;
  detail?: string;
  detailWidth?: number;
}

const GLYPHS = {
  cross: {
    kind: 'shape',
    body: 'M26 6h12a3 3 0 0 1 3 3v14h14a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H41v14a3 3 0 0 1-3 3H26a3 3 0 0 1-3-3V41H9a3 3 0 0 1-3-3V26a3 3 0 0 1 3-3h14V9a3 3 0 0 1 3-3z',
  },
  crossBadge: {
    kind: 'shape',
    body: 'M13 7h38a6 6 0 0 1 6 6v38a6 6 0 0 1-6 6H13a6 6 0 0 1-6-6V13a6 6 0 0 1 6-6z',
    detail: 'M32 18v28M18 32h28',
    detailWidth: 4,
  },
  heart: {
    kind: 'shape',
    body: 'M32 54L14.5 36.5A12.375 12.375 0 0 1 32 19A12.375 12.375 0 0 1 49.5 36.5Z',
    detail: 'M18 33h8l4-7 5 13 4-6h7',
  },
  capsule: {
    kind: 'shape',
    body: 'M20 20h24a12 12 0 0 1 0 24H20a12 12 0 0 1 0-24z',
    detail: 'M32 20v24',
  },
  flask: {
    kind: 'shape',
    body: 'M24 8h16v12l14 26a6 6 0 0 1-5 9H15a6 6 0 0 1-5-9l14-26V8z',
    detail: 'M17 41h30M25 48h.01M34 50h.01M30 45h.01',
  },
  tube: {
    kind: 'shape',
    body: 'M19 6h26v5h-4v33a9 9 0 0 1-18 0V11h-4V6z',
    detail: 'M24 30h16M29 39h.01M35 43h.01',
  },
  syringe: {
    kind: 'shape',
    body: 'M6 29h10v6H6zM14 24h4v16h-4zM18 26h22v12H18zM40 28h5v8h-5zM45 31h13v2H45z',
    detail: 'M24 28v8M29 28v8M34 28v8',
  },
  thermometer: {
    kind: 'shape',
    body: 'M32 6a7 7 0 0 1 7 7v24a11 11 0 1 1-14 0V13a7 7 0 0 1 7-7z',
    detail: 'M32 26v20M34 18h4M34 24h3M34 30h4',
  },
  shield: {
    kind: 'shape',
    body: 'M32 6l22 8v16c0 14-9.5 23-22 28-12.5-5-22-14-22-28V14l22-8z',
    detail: 'M32 22v18M23 31h18',
    detailWidth: 3.4,
  },
  /** Star of life: three 12-wide bars through the centre at 90/30/150 degrees. */
  star: {
    kind: 'shape',
    body: 'M26 6h12v52H26zM6.5 24.2L12.5 13.8 57.5 39.8 51.5 50.2ZM51.5 13.8L57.5 24.2 12.5 50.2 6.5 39.8Z',
  },
  bandage: {
    kind: 'shape',
    body: 'M14 23h36a9 9 0 0 1 0 18H14a9 9 0 0 1 0-18z',
    detail: 'M25 25v14M39 25v14M29 30h.01M35 30h.01M29 34h.01M35 34h.01M32 32h.01',
  },
  kit: {
    kind: 'shape',
    body: 'M12 19h40a5 5 0 0 1 5 5v24a5 5 0 0 1-5 5H12a5 5 0 0 1-5-5V24a5 5 0 0 1 5-5zM26 10h12a3 3 0 0 1 3 3v6h-5v-4H28v4h-5v-6a3 3 0 0 1 3-3z',
    detail: 'M32 26v18M23 35h18',
    detailWidth: 4,
  },
  ivbag: {
    kind: 'shape',
    body: 'M30 6h4v8h-4zM22 14h20a5 5 0 0 1 5 5v22a5 5 0 0 1-5 5H22a5 5 0 0 1-5-5V19a5 5 0 0 1 5-5zM30 46h4v6h-4zM28 52h8v3h-8z',
    detail: 'M23 23h18M23 30h12',
  },
  pillpack: {
    kind: 'shape',
    body: 'M12 18h40a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V22a4 4 0 0 1 4-4z',
    detail: 'M19 28h.01M32 28h.01M45 28h.01M19 38h.01M32 38h.01M45 38h.01',
    detailWidth: 9,
  },
  mortar: {
    kind: 'shape',
    body: 'M9 26h46v5a23 21 0 0 1-46 0v-5zM42 6l8 6-16 18-7-5z',
    detail: 'M18 34h28',
  },
  clipboard: {
    kind: 'shape',
    body: 'M17 12h30a5 5 0 0 1 5 5v34a5 5 0 0 1-5 5H17a5 5 0 0 1-5-5V17a5 5 0 0 1 5-5zM26 7h12a3 3 0 0 1 3 3v4H23v-4a3 3 0 0 1 3-3z',
    detail: 'M32 26v16M24 34h16',
  },
  pillbottle: {
    kind: 'shape',
    body: 'M22 7h20v9H22zM17 16h30a4 4 0 0 1 4 4v30a4 4 0 0 1-4 4H17a4 4 0 0 1-4-4V20a4 4 0 0 1 4-4z',
    detail: 'M32 27v18M23 36h18',
    detailWidth: 4,
  },
  stethoscope: {
    kind: 'line',
    body: 'M21 8v12a11 11 0 0 0 22 0V8M16 8h10M38 8h10M32 31v6a14 14 0 0 0 12 8M44 45a7 7 0 1 1 0 14 7 7 0 1 1 0-14z',
  },
  dna: {
    kind: 'line',
    body: 'M22 6c0 12 20 14 20 26s-20 14-20 26M42 6c0 12-20 14-20 26s20 14 20 26M23 14h18M22 25h20M22 39h20M23 50h18',
  },
  ecg: {
    kind: 'line',
    body: 'M4 32h14l5-14 7 28 6-18 5 4h19',
  },
} satisfies Record<PosterGlyphId, Glyph>;

const PRIMARY = 'hsl(var(--primary))';
const PAPER = 'hsl(var(--card))';

function GlyphSymbol({
  id,
  glyph,
  variant,
}: {
  id: string;
  glyph: Glyph;
  variant: PosterVariant;
}) {
  if (glyph.kind === 'line') {
    return (
      <symbol id={id} viewBox="0 0 64 64">
        <path
          d={glyph.body}
          fill="none"
          stroke={PRIMARY}
          strokeWidth={variant === 'solid' ? 4.4 : 2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </symbol>
    );
  }

  if (variant === 'solid') {
    return (
      <symbol id={id} viewBox="0 0 64 64">
        <path d={glyph.body} fill={PRIMARY} />
        {glyph.detail && (
          <path
            d={glyph.detail}
            fill="none"
            stroke={PAPER}
            strokeWidth={glyph.detailWidth ?? 2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </symbol>
    );
  }

  return (
    <symbol id={id} viewBox="0 0 64 64">
      <path
        d={glyph.body}
        fill={PAPER}
        stroke={PRIMARY}
        strokeWidth={2.6}
        strokeLinejoin="round"
      />
      {glyph.detail && (
        <path
          d={glyph.detail}
          fill="none"
          stroke={PRIMARY}
          strokeWidth={glyph.detailWidth ?? 2.1}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.8}
        />
      )}
    </symbol>
  );
}

/**
 * Emits one <use> per placement plus wrap copies for any glyph whose bounds
 * cross a tile edge, so motifs read continuously across seams.
 */
function tileUses(items: PosterPlacement[], pitch: number, scale: number, prefix: string) {
  return items.flatMap((p, i) => {
    const size = 64 * p.s * scale;
    const reach = size * 0.72;
    const cx = p.x * scale;
    const cy = p.y * scale;

    const xs = [0];
    if (cx < reach) xs.push(pitch);
    if (cx > pitch - reach) xs.push(-pitch);
    const ys = [0];
    if (cy < reach) ys.push(pitch);
    if (cy > pitch - reach) ys.push(-pitch);

    return xs.flatMap((ox) =>
      ys.map((oy) => (
        <use
          key={`${i}-${ox}-${oy}`}
          href={`#${prefix}-${p.v}-${p.g}`}
          x={-size / 2}
          y={-size / 2}
          width={size}
          height={size}
          transform={`translate(${cx + ox} ${cy + oy}) rotate(${p.r})`}
        />
      ))
    );
  });
}

const USED_SYMBOLS = Array.from(
  new Set(POSTER_PLACEMENTS.map((p) => `${p.v}|${p.g}`))
).map((key) => {
  const [v, g] = key.split('|') as [PosterVariant, PosterGlyphId];
  return { v, g };
});

function PosterLayer({
  scale,
  prefix,
  className,
}: {
  scale: number;
  prefix: string;
  className?: string;
}) {
  const pitch = POSTER_PITCH * scale;

  return (
    <div className={cn('absolute inset-0', className)}>
      <svg
        className="h-full w-full"
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {USED_SYMBOLS.map(({ v, g }) => (
            <GlyphSymbol
              key={`${v}-${g}`}
              id={`${prefix}-${v}-${g}`}
              glyph={GLYPHS[g]}
              variant={v}
            />
          ))}

          <pattern
            id={`${prefix}-tile`}
            patternUnits="userSpaceOnUse"
            width={pitch}
            height={pitch}
          >
            {tileUses(POSTER_PLACEMENTS, pitch, scale, prefix)}
          </pattern>
        </defs>

        <rect width="100%" height="100%" fill={`url(#${prefix}-tile)`} opacity={0.6} />
      </svg>
    </div>
  );
}

/** Decorative medical-poster frame for practice auth screens. Accents follow `--primary`. */
export function PracticeAuthBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-card" aria-hidden>
      {/*
       * The pitch is scaled per breakpoint: phones need a short pitch so their
       * narrow side bands stay populated, while wider screens need a long one
       * so the tile does not visibly repeat down the margin.
       */}
      <PosterLayer scale={0.45} prefix="mspa-s" className="md:hidden" />
      <PosterLayer scale={0.65} prefix="mspa-m" className="hidden md:block lg:hidden" />
      <PosterLayer scale={1} prefix="mspa-l" className="hidden lg:block" />
    </div>
  );
}
