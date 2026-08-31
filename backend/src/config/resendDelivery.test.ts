import { afterEach, describe, expect, it } from 'vitest';
import { env } from './env';
import { isResendSendEnabled } from './resendDelivery';

describe('isResendSendEnabled', () => {
  const prevAppEnv = process.env.APP_ENV;
  const prevFlag = process.env.RESEND_ENABLE_IN_DEV;

  afterEach(() => {
    if (prevAppEnv === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = prevAppEnv;
    if (prevFlag === undefined) delete process.env.RESEND_ENABLE_IN_DEV;
    else process.env.RESEND_ENABLE_IN_DEV = prevFlag;
  });

  it('is false in development by default so unverified From domains are not called', () => {
    process.env.APP_ENV = 'development';
    delete process.env.RESEND_ENABLE_IN_DEV;
    expect(isResendSendEnabled()).toBe(false);
  });

  it('is false in test by default', () => {
    process.env.APP_ENV = 'test';
    delete process.env.RESEND_ENABLE_IN_DEV;
    expect(isResendSendEnabled()).toBe(false);
  });

  it('sends in development only when RESEND_ENABLE_IN_DEV=true and an API key is set', () => {
    process.env.APP_ENV = 'development';
    process.env.RESEND_ENABLE_IN_DEV = 'true';
    expect(isResendSendEnabled()).toBe(Boolean(env.RESEND_API_KEY));
  });

  it('sends in staging when an API key is set', () => {
    process.env.APP_ENV = 'staging';
    delete process.env.RESEND_ENABLE_IN_DEV;
    expect(isResendSendEnabled()).toBe(Boolean(env.RESEND_API_KEY));
  });
});
