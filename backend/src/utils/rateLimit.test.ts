import { describe, expect, it } from 'vitest';
import { checkRateLimit, clearRateLimitBuckets } from '../utils/rateLimit';

describe('rateLimit', () => {
  it('allows up to max then blocks within window', () => {
    clearRateLimitBuckets();
    expect(checkRateLimit({ bucket: 't', key: 'a', max: 2, windowMs: 60_000 })).toBe(true);
    expect(checkRateLimit({ bucket: 't', key: 'a', max: 2, windowMs: 60_000 })).toBe(true);
    expect(checkRateLimit({ bucket: 't', key: 'a', max: 2, windowMs: 60_000 })).toBe(false);
  });

  it('isolates keys and buckets', () => {
    clearRateLimitBuckets();
    expect(checkRateLimit({ bucket: 't1', key: 'a', max: 1, windowMs: 60_000 })).toBe(true);
    expect(checkRateLimit({ bucket: 't1', key: 'b', max: 1, windowMs: 60_000 })).toBe(true);
    expect(checkRateLimit({ bucket: 't2', key: 'a', max: 1, windowMs: 60_000 })).toBe(true);
  });
});
