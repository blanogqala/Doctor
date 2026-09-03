import { describe, expect, it } from 'vitest';
import { shouldRenderDoctorPhoto } from './doctor-photo';

describe('shouldRenderDoctorPhoto', () => {
  it('falls back when the photo is missing', () => {
    expect(shouldRenderDoctorPhoto(null)).toBe(false);
    expect(shouldRenderDoctorPhoto('')).toBe(false);
  });

  it('falls back after a load failure without retrying the same src', () => {
    const src =
      'https://api.medinathi.co.za/api/public/practice-doctor-photos/prac/doc/missing.jpg';
    expect(shouldRenderDoctorPhoto(src, null)).toBe(true);
    expect(shouldRenderDoctorPhoto(src, src)).toBe(false);
  });

  it('retries when the src is replaced with a new photo URL', () => {
    const oldSrc =
      'https://api.medinathi.co.za/api/public/practice-doctor-photos/prac/doc/old.png';
    const newSrc =
      'https://api.medinathi.co.za/api/public/practice-doctor-photos/prac/doc/new.png';
    expect(shouldRenderDoctorPhoto(newSrc, oldSrc)).toBe(true);
  });
});
