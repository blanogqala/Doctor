import { describe, expect, it } from 'vitest';
import { SubscriptionStatus, SubscriptionSuspensionReason, UserRole } from '@prisma/client';
import type { Request, Response } from 'express';
import { enforcePracticeAccess, type PracticeContext } from './tenant';
import { derivePracticeAccess } from '../services/practiceAccessPolicy';

function mockRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as typeof res & Response;
}

function makeReq(overrides: {
  method?: string;
  path?: string;
  role?: UserRole;
  accessPractice?: Partial<PracticeContext>;
}): Request {
  const practiceBase = {
    id: 'p1',
    subdomain: 'clinic',
    clinicName: 'Clinic',
    logoUrl: null,
    brandColor: '#1E40AF',
    subscriptionStatus: SubscriptionStatus.SUSPENDED,
    trialEndsAt: null,
    subscriptionEndsAt: null,
    monthlyFeeCents: 80000,
    ownerProfileId: 'owner-1',
    subscriptionSuspensionReason: SubscriptionSuspensionReason.BILLING_OVERDUE,
    subscriptionSuspendedAt: new Date('2026-09-19T00:00:00.000Z'),
    ...overrides.accessPractice,
  };
  const access = derivePracticeAccess(practiceBase);
  return {
    method: overrides.method ?? 'GET',
    path: overrides.path ?? '/api/patients',
    originalUrl: overrides.path ?? '/api/patients',
    user: overrides.role
      ? { userId: 'u1', role: overrides.role, practiceId: 'p1' }
      : undefined,
    practiceContext: { ...practiceBase, access },
  } as unknown as Request;
}

describe('enforcePracticeAccess', () => {
  it('allows GET patients in billing READ_ONLY', () => {
    const req = makeReq({ method: 'GET', path: '/api/patients', role: UserRole.DOCTOR });
    const res = mockRes();
    let nextCalled = false;
    enforcePracticeAccess(req, res, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
  });

  it('blocks POST patients in billing READ_ONLY with PRACTICE_READ_ONLY', () => {
    const req = makeReq({ method: 'POST', path: '/api/patients', role: UserRole.ADMIN });
    const res = mockRes();
    enforcePracticeAccess(req, res, () => undefined);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({
      code: 'PRACTICE_READ_ONLY',
      access_mode: 'READ_ONLY',
    });
    expect((res.body as { error: string }).error).toContain('read-only');
  });

  it('uses generic copy for PATIENT READ_ONLY mutations', () => {
    const req = makeReq({ method: 'POST', path: '/api/appointments', role: UserRole.PATIENT });
    const res = mockRes();
    enforcePracticeAccess(req, res, () => undefined);
    expect(res.statusCode).toBe(403);
    expect((res.body as { error: string }).error).not.toMatch(/overdue|invoice|unpaid/i);
  });

  it('allows login, me, report-payment, and mark-read during READ_ONLY', () => {
    for (const [method, path] of [
      ['POST', '/api/auth/login'],
      ['GET', '/api/auth/me'],
      ['POST', '/api/auth/change-password'],
      ['POST', '/api/practice-management/invoices/inv-1/report-payment'],
      ['PATCH', '/api/messages/m1/read'],
    ] as const) {
      const req = makeReq({ method, path, role: UserRole.DOCTOR });
      const res = mockRes();
      let nextCalled = false;
      enforcePracticeAccess(req, res, () => {
        nextCalled = true;
      });
      expect(nextCalled).toBe(true);
    }
  });

  it('blocks clinical GET during MANUAL suspension', () => {
    const req = makeReq({
      method: 'GET',
      path: '/api/medical-records',
      role: UserRole.DOCTOR,
      accessPractice: {
        subscriptionSuspensionReason: SubscriptionSuspensionReason.MANUAL,
      },
    });
    const res = mockRes();
    enforcePracticeAccess(req, res, () => undefined);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({
      code: 'PRACTICE_SUSPENDED',
      access_mode: 'BLOCKED',
    });
  });

  it('blocks clinical GET for legacy SUSPENDED/null reason', () => {
    const req = makeReq({
      method: 'GET',
      path: '/api/patients',
      role: UserRole.DOCTOR,
      accessPractice: { subscriptionSuspensionReason: null },
    });
    const res = mockRes();
    enforcePracticeAccess(req, res, () => undefined);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: 'PRACTICE_SUSPENDED' });
  });

  it('uses PRACTICE_CANCELLED for cancelled Practices', () => {
    const req = makeReq({
      method: 'GET',
      path: '/api/patients',
      accessPractice: { subscriptionStatus: SubscriptionStatus.CANCELLED },
    });
    const res = mockRes();
    enforcePracticeAccess(req, res, () => undefined);
    expect(res.body).toMatchObject({ code: 'PRACTICE_CANCELLED' });
  });

  it('uses TRIAL_EXPIRED for ownerless expired trial', () => {
    const req = makeReq({
      method: 'GET',
      path: '/api/patients',
      accessPractice: {
        subscriptionStatus: SubscriptionStatus.TRIAL,
        trialEndsAt: new Date('2020-01-01T00:00:00.000Z'),
        ownerProfileId: null,
        subscriptionSuspensionReason: null,
      },
    });
    const res = mockRes();
    enforcePracticeAccess(req, res, () => undefined);
    expect(res.body).toMatchObject({ code: 'TRIAL_EXPIRED' });
  });

  it('does not enforce public or invitation paths', () => {
    const req = makeReq({ method: 'GET', path: '/api/public/practice-info' });
    const res = mockRes();
    let nextCalled = false;
    enforcePracticeAccess(req, res, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
  });
});
