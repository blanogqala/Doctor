import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { AppError } from '../middleware/errorHandler';

describe('groqClient timeout', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('maps AbortError to 504 AppError', async () => {
    vi.stubEnv('GROQ_TIMEOUT_MS', '50');
    global.fetch = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          signal.addEventListener('abort', () => {
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    }) as typeof fetch;

    const { groqFetch } = await import('./groqClient');
    await expect(groqFetch('https://example.test/x', { timeoutMs: 10 })).rejects.toMatchObject({
      statusCode: 504,
    } satisfies Partial<AppError>);
  });
});
