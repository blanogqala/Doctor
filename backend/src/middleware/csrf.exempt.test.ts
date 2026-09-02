import { describe, expect, it, vi } from 'vitest';
import {
  csrfProtect,
  isPublicTokenCsrfExempt,
  PUBLIC_TOKEN_CSRF_EXEMPT_POSTS,
} from './csrf';
import type { Request, Response } from 'express';

function mockRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe('public token CSRF exemption', () => {
  it('exempts invitation and activation accept, and password reset', () => {
    expect(isPublicTokenCsrfExempt('POST', '/api/invitations/accept')).toBe(true);
    expect(isPublicTokenCsrfExempt('POST', '/api/activations/accept')).toBe(true);
    expect(isPublicTokenCsrfExempt('POST', '/api/auth/reset-password')).toBe(true);
    expect(PUBLIC_TOKEN_CSRF_EXEMPT_POSTS).not.toContain('/api/auth/login');
    expect(isPublicTokenCsrfExempt('POST', '/api/patients')).toBe(false);
    expect(isPublicTokenCsrfExempt('GET', '/api/invitations/accept')).toBe(false);
  });

  it('allows POST /api/invitations/accept with a leftover session and no CSRF header', () => {
    const next = vi.fn();
    const res = mockRes();
    csrfProtect(
      {
        method: 'POST',
        path: '/api/invitations/accept',
        originalUrl: '/api/invitations/accept',
        practiceSession: { id: 'sess-1', csrfTokenHash: 'deadbeef' },
        get: () => undefined,
        body: { token: 'raw-invite-token', password: 'SecurePass123!' },
      } as unknown as Request,
      res,
      next
    );
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('still requires CSRF on authenticated practice mutations', () => {
    const next = vi.fn();
    const res = mockRes();
    csrfProtect(
      {
        method: 'POST',
        path: '/api/patients',
        originalUrl: '/api/patients',
        practiceSession: { id: 'sess-1', csrfTokenHash: 'deadbeef' },
        get: (name: string) => (name === 'origin' ? 'http://pilot.localhost:3000' : undefined),
        body: {},
      } as unknown as Request,
      res,
      next
    );
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(String(res.json.mock.calls[0][0].error)).toMatch(/CSRF/);
  });

  it('rejects invalid CSRF on authenticated practice mutations', () => {
    const next = vi.fn();
    const res = mockRes();
    csrfProtect(
      {
        method: 'POST',
        path: '/api/patients',
        originalUrl: '/api/patients',
        practiceSession: { id: 'sess-1', csrfTokenHash: 'deadbeef' },
        get: (name: string) => {
          if (name === 'origin') return 'http://pilot.localhost:3000';
          if (name === 'x-csrf-token') return 'not-the-session-csrf';
          return undefined;
        },
        body: {},
      } as unknown as Request,
      res,
      next
    );
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(String(res.json.mock.calls[0][0].error)).toMatch(/CSRF/);
  });
});
