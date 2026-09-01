import { afterEach, describe, expect, it } from 'vitest';
import {
  buildUatActivationUrlIfEnabled,
  isUatActivationLinksEnabled,
} from './uatActivationLinks';

describe('isUatActivationLinksEnabled (APP_ENV authoritative)', () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevAppEnv = process.env.APP_ENV;
  const prevFlag = process.env.ENABLE_UAT_INVITATION_LINKS;

  afterEach(() => {
    process.env.NODE_ENV = prevNodeEnv;
    if (prevAppEnv === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = prevAppEnv;
    if (prevFlag === undefined) delete process.env.ENABLE_UAT_INVITATION_LINKS;
    else process.env.ENABLE_UAT_INVITATION_LINKS = prevFlag;
  });

  it('is false when APP_ENV=production + flag', () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_ENV = 'production';
    process.env.ENABLE_UAT_INVITATION_LINKS = 'true';
    expect(isUatActivationLinksEnabled()).toBe(false);
    expect(buildUatActivationUrlIfEnabled('cape-test', 'tok')).toBeUndefined();
  });

  it('allows staging + NODE_ENV=production + flag', () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_ENV = 'staging';
    process.env.ENABLE_UAT_INVITATION_LINKS = 'true';
    expect(isUatActivationLinksEnabled()).toBe(true);
    expect(buildUatActivationUrlIfEnabled('cape-test', 'tok')).toContain('/activate?token=');
    expect(buildUatActivationUrlIfEnabled('cape-test', 'tok')).not.toContain('cape-test.');
  });
});
