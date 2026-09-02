/**
 * Placement geometry for the practice auth poster wallpaper.
 *
 * Glyphs sit on a staggered grid with bounded jitter, which keeps every pair of
 * neighbours clear of one another by construction:
 *
 *   - nearest centres are POSTER_CELL apart within a row, and
 *     sqrt((CELL/2)^2 + CELL^2) diagonally, so CELL is the binding constraint;
 *   - jitter is capped at MAX_JITTER per axis, so the worst-case centre
 *     distance is CELL - 2 * MAX_JITTER = 92;
 *   - the largest glyph radius is GLYPH_RADIUS_UNIT * MAX_SCALE = 39, so two
 *     neighbours need at most 78.
 *
 * That leaves at least 14px of clear space in the worst case. `minPosterGap`
 * measures the real figure and is asserted in the unit test.
 */

export const POSTER_CELL = 120;
export const POSTER_COLS = 6;
export const POSTER_ROWS = 6;
export const POSTER_PITCH = POSTER_COLS * POSTER_CELL;

/** Glyph art fills roughly the inner 60 units of its 64-unit box. */
export const GLYPH_RADIUS_UNIT = 30;
export const MAX_JITTER = 14;
export const MAX_ROTATION = 45;
export const MIN_SCALE = 1;
export const MAX_SCALE = 1.3;

export type PosterVariant = 'solid' | 'line';

export type PosterGlyphId =
  | 'cross'
  | 'crossBadge'
  | 'heart'
  | 'capsule'
  | 'flask'
  | 'tube'
  | 'syringe'
  | 'thermometer'
  | 'shield'
  | 'star'
  | 'bandage'
  | 'kit'
  | 'ivbag'
  | 'pillpack'
  | 'mortar'
  | 'clipboard'
  | 'pillbottle'
  | 'stethoscope'
  | 'dna'
  | 'ecg';

interface PosterCell {
  g: PosterGlyphId;
  v: PosterVariant;
}

/**
 * One entry per grid cell, row-major. Ordered so no glyph repeats within a
 * neighbouring cell, and weighted roughly 40/60 solid to outlined.
 */
const POSTER_TILE: PosterCell[] = [
  // row 0
  { g: 'crossBadge', v: 'solid' },
  { g: 'stethoscope', v: 'line' },
  { g: 'capsule', v: 'solid' },
  { g: 'thermometer', v: 'line' },
  { g: 'dna', v: 'line' },
  { g: 'kit', v: 'solid' },
  // row 1
  { g: 'heart', v: 'line' },
  { g: 'syringe', v: 'line' },
  { g: 'flask', v: 'solid' },
  { g: 'pillpack', v: 'line' },
  { g: 'mortar', v: 'line' },
  { g: 'shield', v: 'line' },
  // row 2
  { g: 'tube', v: 'line' },
  { g: 'star', v: 'solid' },
  { g: 'bandage', v: 'solid' },
  { g: 'clipboard', v: 'line' },
  { g: 'ivbag', v: 'line' },
  { g: 'cross', v: 'solid' },
  // row 3
  { g: 'pillbottle', v: 'line' },
  { g: 'ecg', v: 'line' },
  { g: 'thermometer', v: 'solid' },
  { g: 'crossBadge', v: 'line' },
  { g: 'heart', v: 'solid' },
  { g: 'capsule', v: 'line' },
  // row 4
  { g: 'dna', v: 'solid' },
  { g: 'flask', v: 'line' },
  { g: 'stethoscope', v: 'line' },
  { g: 'tube', v: 'solid' },
  { g: 'pillpack', v: 'solid' },
  { g: 'bandage', v: 'line' },
  // row 5
  { g: 'kit', v: 'line' },
  { g: 'shield', v: 'solid' },
  { g: 'mortar', v: 'line' },
  { g: 'syringe', v: 'solid' },
  { g: 'cross', v: 'line' },
  { g: 'star', v: 'line' },
];

/**
 * Integer-only hash in [0, 1). Bitwise operations are exactly specified in
 * ECMAScript, so this is bit-identical between the server render and the client
 * hydrate. `Math.sin`-style hashing is avoided on purpose: its precision is
 * implementation-defined and could differ between Node and the browser.
 */
function hash(index: number, salt: number): number {
  const seed = (index + 1) * 2654435761 + salt * 40503;
  const mixed = (seed ^ (seed >>> 15)) >>> 0;
  return (mixed % 1000) / 1000;
}

/** Signed value in [-span, span] derived deterministically from a cell index. */
function spread(index: number, salt: number, span: number): number {
  return Math.round((hash(index, salt) * 2 - 1) * span);
}

export interface PosterJitter {
  dx: number;
  dy: number;
  rot: number;
  scale: number;
}

export function posterJitter(index: number): PosterJitter {
  return {
    dx: spread(index, 1, MAX_JITTER),
    dy: spread(index, 2, MAX_JITTER),
    rot: spread(index, 3, MAX_ROTATION),
    scale:
      MIN_SCALE + Math.round(hash(index, 4) * (MAX_SCALE - MIN_SCALE) * 100) / 100,
  };
}

/** Un-jittered centre of a cell. Odd rows shift half a cell to stagger the grid. */
export function posterCellCentre(index: number): { x: number; y: number } {
  const col = index % POSTER_COLS;
  const row = Math.floor(index / POSTER_COLS);
  return {
    x: col * POSTER_CELL + POSTER_CELL / 2 + (row % 2 ? POSTER_CELL / 2 : 0),
    y: row * POSTER_CELL + POSTER_CELL / 2,
  };
}

export interface PosterPlacement {
  g: PosterGlyphId;
  v: PosterVariant;
  x: number;
  y: number;
  /** Rotation in degrees. */
  r: number;
  s: number;
}

function wrap(value: number): number {
  return ((value % POSTER_PITCH) + POSTER_PITCH) % POSTER_PITCH;
}

export const POSTER_PLACEMENTS: PosterPlacement[] = POSTER_TILE.map((cell, i) => {
  const centre = posterCellCentre(i);
  const { dx, dy, rot, scale } = posterJitter(i);
  return {
    g: cell.g,
    v: cell.v,
    x: wrap(centre.x + dx),
    y: wrap(centre.y + dy),
    r: rot,
    s: scale,
  };
});

/** Shortest distance between two coordinates on a wrapping axis. */
function toroidalDelta(a: number, b: number): number {
  const raw = Math.abs(a - b);
  return Math.min(raw, POSTER_PITCH - raw);
}

/**
 * Smallest edge-to-edge clearance between any two glyphs in the tile, measured
 * across the wrap. Positive means nothing overlaps.
 */
export function minPosterGap(placements: PosterPlacement[] = POSTER_PLACEMENTS): number {
  let min = Infinity;

  for (let i = 0; i < placements.length; i += 1) {
    for (let j = i + 1; j < placements.length; j += 1) {
      const a = placements[i];
      const b = placements[j];
      const dx = toroidalDelta(a.x, b.x);
      const dy = toroidalDelta(a.y, b.y);
      const centreDistance = Math.sqrt(dx * dx + dy * dy);
      const radii = GLYPH_RADIUS_UNIT * a.s + GLYPH_RADIUS_UNIT * b.s;
      min = Math.min(min, centreDistance - radii);
    }
  }

  return min;
}
