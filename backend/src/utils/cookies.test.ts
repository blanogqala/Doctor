import { describe, expect, it } from 'vitest';
import type { Response } from 'express';
import { PRACTICE_SESSION_COOKIE, setPracticeSessionCookie } from './cookies';

function mockRes() {
  const headers = new Map<string, string | number | string[]>();
  const res = {
    getHeader(name: string) {
      return headers.get(name.toLowerCase());
    },
    setHeader(name: string, value: string | number | readonly string[]) {
      headers.set(name.toLowerCase(), value as string | number | string[]);
    },
  };
  return { res: res as unknown as Response, headers };
}

describe('session cookies', () => {
  it('are host-only (no Domain= attribute)', () => {
    const { res, headers } = mockRes();
    setPracticeSessionCookie(res, 'raw-session-token');
    const setCookie = headers.get('set-cookie');
    const value = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie);
    expect(value).toContain(`${PRACTICE_SESSION_COOKIE}=`);
    expect(value).toMatch(/HttpOnly/i);
    expect(value).not.toMatch(/(?:^|;\s*)Domain=/i);
  });
});
