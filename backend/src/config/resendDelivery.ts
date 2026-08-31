import { env } from './env';
import { resolveAppEnv } from './appEnv';

/**
 * Whether to call the Resend API.
 * Staging/production send when RESEND_API_KEY is set.
 * Development/test skip unless RESEND_ENABLE_IN_DEV=true — an unverified
 * medispace.co.za From domain otherwise 403s on every invite/invoice.
 */
export function isResendSendEnabled(): boolean {
  if (!env.RESEND_API_KEY) return false;
  const appEnv = resolveAppEnv();
  if (appEnv === 'development' || appEnv === 'test') {
    return process.env.RESEND_ENABLE_IN_DEV === 'true';
  }
  return true;
}
