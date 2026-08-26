import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler';

/**
 * Shared Groq HTTP helper with explicit timeout + AbortController.
 * Never logs request/response bodies (may contain PHI).
 */
export async function groqFetch(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = env.GROQ_TIMEOUT_MS, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...rest,
      signal: controller.signal,
    });
    return res;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new AppError(504, 'AI provider request timed out. Please try again.');
    }
    throw new AppError(502, 'AI provider request failed. Please try again.');
  } finally {
    clearTimeout(timer);
  }
}
