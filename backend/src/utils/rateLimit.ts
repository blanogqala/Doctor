/**
 * Lightweight in-memory sliding-window rate limiter.
 * Reused across auth-sensitive endpoints — no extra library.
 */

type Bucket = Map<string, number[]>;

const buckets = new Map<string, Bucket>();

export function checkRateLimit(options: {
  key: string;
  bucket: string;
  max: number;
  windowMs: number;
}): boolean {
  let map = buckets.get(options.bucket);
  if (!map) {
    map = new Map();
    buckets.set(options.bucket, map);
  }
  const now = Date.now();
  const timestamps = (map.get(options.key) ?? []).filter((t) => now - t < options.windowMs);
  if (timestamps.length >= options.max) {
    map.set(options.key, timestamps);
    return false;
  }
  timestamps.push(now);
  map.set(options.key, timestamps);
  return true;
}

export function clientIp(req: { ip?: string; headers?: Record<string, unknown> }): string {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || 'unknown';
}

/** Test helper — clear all buckets. */
export function clearRateLimitBuckets(): void {
  buckets.clear();
}
