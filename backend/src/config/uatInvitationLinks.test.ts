import { afterEach, describe, expect, it } from 'vitest';
import {
  buildUatInvitationUrlIfEnabled,
  isUatInvitationLinksEnabled,
} from './uatInvitationLinks';

describe('isUatInvitationLinksEnabled (APP_ENV authoritative)', () => {
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

  it('is false when APP_ENV=production even if flag is true', () => {
    process.env.NODE_ENV = 'development';
    process.env.APP_ENV = 'production';
    process.env.ENABLE_UAT_INVITATION_LINKS = 'true';
    expect(isUatInvitationLinksEnabled()).toBe(false);
    expect(buildUatInvitationUrlIfEnabled('cape-test', 'secret-token-value')).toBeUndefined();
  });

  it('is false when APP_ENV unset and NODE_ENV=production (fail-closed)', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.APP_ENV;
    process.env.ENABLE_UAT_INVITATION_LINKS = 'true';
    expect(isUatInvitationLinksEnabled()).toBe(false);
  });

  it('allows staging + NODE_ENV=production + flag true', () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_ENV = 'staging';
    process.env.ENABLE_UAT_INVITATION_LINKS = 'true';
    expect(isUatInvitationLinksEnabled()).toBe(true);
    const url = buildUatInvitationUrlIfEnabled('cape-test', 'secret-token-value');
    expect(url).toContain('/invite?token=');
  });

  it('allows development + flag true', () => {
    process.env.NODE_ENV = 'development';
    process.env.APP_ENV = 'development';
    process.env.ENABLE_UAT_INVITATION_LINKS = 'true';
    expect(isUatInvitationLinksEnabled()).toBe(true);
  });

  it('is false in development when flag is unset', () => {
    process.env.NODE_ENV = 'development';
    process.env.APP_ENV = 'development';
    delete process.env.ENABLE_UAT_INVITATION_LINKS;
    expect(isUatInvitationLinksEnabled()).toBe(false);
  });

  it('is false when flag is not exactly true', () => {
    process.env.NODE_ENV = 'development';
    process.env.APP_ENV = 'staging';
    process.env.ENABLE_UAT_INVITATION_LINKS = '1';
    expect(isUatInvitationLinksEnabled()).toBe(false);
  });
});
