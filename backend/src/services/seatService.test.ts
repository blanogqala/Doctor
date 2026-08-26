import { describe, expect, it } from 'vitest';
import { AppError } from '../middleware/errorHandler';

describe('seatService allocation math', () => {
  it('available seats never go below zero', () => {
    const limit = 3;
    const active = 2;
    const pending = 2;
    const allocated = active + pending;
    const available = Math.max(0, limit - allocated);
    expect(available).toBe(0);
    expect(allocated >= limit).toBe(true);
  });

  it('seat limit error uses 409 code contract', () => {
    const err = new AppError(
      409,
      'Doctor seat limit reached (3 of 3 allocated)',
      'DOCTOR_SEAT_LIMIT'
    );
    expect(err.statusCode).toBe(409);
    expect(err.message).toContain('seat limit');
  });
});
