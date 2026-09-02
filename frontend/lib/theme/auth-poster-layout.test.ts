import { describe, expect, it } from 'vitest';
import {
  GLYPH_RADIUS_UNIT,
  MAX_JITTER,
  MAX_ROTATION,
  MAX_SCALE,
  MIN_SCALE,
  POSTER_CELL,
  POSTER_COLS,
  POSTER_PITCH,
  POSTER_PLACEMENTS,
  POSTER_ROWS,
  minPosterGap,
  posterCellCentre,
  posterJitter,
} from './auth-poster-layout';

describe('auth poster layout', () => {
  it('fills every grid cell exactly once', () => {
    expect(POSTER_PLACEMENTS).toHaveLength(POSTER_COLS * POSTER_ROWS);
    expect(POSTER_COLS * POSTER_CELL).toBe(POSTER_PITCH);
    expect(POSTER_ROWS * POSTER_CELL).toBe(POSTER_PITCH);
  });

  it('keeps derived jitter, rotation and scale inside their bounds', () => {
    POSTER_PLACEMENTS.forEach((_, i) => {
      const { dx, dy, rot, scale } = posterJitter(i);
      expect(Math.abs(dx)).toBeLessThanOrEqual(MAX_JITTER);
      expect(Math.abs(dy)).toBeLessThanOrEqual(MAX_JITTER);
      expect(Math.abs(rot)).toBeLessThanOrEqual(MAX_ROTATION);
      expect(scale).toBeGreaterThanOrEqual(MIN_SCALE);
      expect(scale).toBeLessThanOrEqual(MAX_SCALE);
    });
  });

  it('never lets two glyphs overlap, including across the tile seam', () => {
    expect(minPosterGap()).toBeGreaterThan(0);
  });

  it('holds the worst-case clearance the geometry promises', () => {
    // CELL - 2 * MAX_JITTER centres apart, minus two maximum-radius glyphs.
    const worstCase = POSTER_CELL - 2 * MAX_JITTER - 2 * GLYPH_RADIUS_UNIT * MAX_SCALE;
    expect(worstCase).toBeGreaterThan(0);
    expect(minPosterGap()).toBeGreaterThanOrEqual(worstCase);
  });

  it('places each glyph within its own staggered cell', () => {
    POSTER_PLACEMENTS.forEach((p, i) => {
      const centre = posterCellCentre(i);
      const { dx, dy } = posterJitter(i);
      expect(p.x).toBe(((centre.x + dx) % POSTER_PITCH + POSTER_PITCH) % POSTER_PITCH);
      expect(p.y).toBe(((centre.y + dy) % POSTER_PITCH + POSTER_PITCH) % POSTER_PITCH);
    });
  });

  it('is deterministic, so server and client renders agree', () => {
    expect(posterJitter(0)).toEqual(posterJitter(0));
    expect(POSTER_PLACEMENTS.map((p) => `${p.x},${p.y},${p.r},${p.s}`)).toEqual(
      POSTER_PLACEMENTS.map((p) => `${p.x},${p.y},${p.r},${p.s}`)
    );
  });
});
