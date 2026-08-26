/**
 * Phase 8 Block 2 — session / CSRF / cookie auth matrix.
 * Requires RUN_INTEGRATION=1 and reachable PostgreSQL.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { UserRole, SubscriptionStatus, SubscriptionPlan } from '@prisma/client';
import { app } from '../../server';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { assertNonProductionDatabaseUrl } from '../assertNonProductionDb';
import { issuePlatformAuth, issuePracticeAuth } from '../sessionAuth';
import { PRACTICE_SESSION_COOKIE, PLATFORM_SESSION_COOKIE } from '../../utils/cookies';
import { hashToken } from '../../utils/secureToken';

const RUN = Boolean(process.env.RUN_INTEGRATION);

async function assertDb(): Promise<void> {
  assertNonProductionDatabaseUrl(process.env.DATABASE_URL || env.DATABASE_URL);
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    throw new Error(
      `RUN_INTEGRATION=1 but PostgreSQL is unavailable: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

describe.skipIf(!RUN)('Block 2 session auth matrix (RUN_INTEGRATION=1)', () => {
  const suffix = `b2-${Date.now()}`;
  let practiceId = '';
  let otherPracticeId = '';
  let doctorId = '';
  let otherDoctorId = '';
  let superAdminId = '';
  let createdPracticeIds: string[] = [];
  let createdSuperAdminIds: string[] = [];

  beforeAll(async () => {
    await assertDb();

    const sa = await prisma.superAdmin.create({
      data: {
        email: `sa-${suffix}@medspace.test`,
        name: 'Block2 SA',
        passwordHash: await bcrypt.hash('TestPass123!', 10),
      },
    });
    superAdminId = sa.id;
    createdSuperAdminIds.push(sa.id);

    const practice = await prisma.practice.create({
      data: {
        subdomain: `b2a-${Date.now().toString(36)}`,
        clinicName: `Block2 A ${suffix}`,
        email: `clinic-a-${suffix}@medspace.test`,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionPlan: SubscriptionPlan.CLINIC,
        doctorSeatLimit: 5,
        monthlyFeeCents: 350_000,
        brandColor: '#1E40AF',
      },
    });
    practiceId = practice.id;
    createdPracticeIds.push(practice.id);

    const doctor = await prisma.profile.create({
      data: {
        practiceId,
        email: `doc-${suffix}@medspace.test`,
        fullName: 'Block2 Doctor',
        role: UserRole.DOCTOR,
        passwordHash: await bcrypt.hash('TestPass123!', 10),
        isActive: true,
      },
    });
    doctorId = doctor.id;
    await prisma.practice.update({
      where: { id: practiceId },
      data: { ownerProfileId: doctor.id },
    });
    await prisma.doctor.create({
      data: {
        practiceId,
        profileId: doctor.id,
        specialization: 'GP',
        practiceName: 'Block2',
      },
    });

    const other = await prisma.practice.create({
      data: {
        subdomain: `b2b-${Date.now().toString(36)}`,
        clinicName: `Block2 B ${suffix}`,
        email: `clinic-b-${suffix}@medspace.test`,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionPlan: SubscriptionPlan.CLINIC,
        doctorSeatLimit: 5,
        monthlyFeeCents: 350_000,
        brandColor: '#1E40AF',
      },
    });
    otherPracticeId = other.id;
    createdPracticeIds.push(other.id);

    const otherDoc = await prisma.profile.create({
      data: {
        practiceId: otherPracticeId,
        email: `otherdoc-${suffix}@medspace.test`,
        fullName: 'Other Doctor',
        role: UserRole.DOCTOR,
        passwordHash: await bcrypt.hash('TestPass123!', 10),
        isActive: true,
      },
    });
    otherDoctorId = otherDoc.id;
  });

  afterAll(async () => {
    try {
      for (const id of createdPracticeIds) {
        await prisma.practiceSession.deleteMany({ where: { practiceId: id } });
        await prisma.doctor.deleteMany({ where: { practiceId: id } });
        await prisma.profile.deleteMany({ where: { practiceId: id } });
        await prisma.practice.delete({ where: { id } }).catch(() => undefined);
      }
      for (const id of createdSuperAdminIds) {
        await prisma.platformSession.deleteMany({ where: { superAdminId: id } });
        await prisma.superAdmin.delete({ where: { id } }).catch(() => undefined);
      }
    } catch {
      // best-effort
    }
  });

  it('isolates practice sessions across tenants', async () => {
    const auth = await issuePracticeAuth({ profileId: doctorId, practiceId });
    const otherPractice = await prisma.practice.findUniqueOrThrow({
      where: { id: otherPracticeId },
    });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', auth.cookie)
      .set('X-Tenant-Subdomain', otherPractice.subdomain);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PRACTICE_MISMATCH');
  });

  it('rejects practice cookie on platform routes', async () => {
    const auth = await issuePracticeAuth({ profileId: doctorId, practiceId });
    const res = await request(app)
      .get('/api/super-admin/me')
      .set('Cookie', auth.cookie);

    expect(res.status).toBe(403);
  });

  it('rejects platform cookie on practice routes', async () => {
    const auth = await issuePlatformAuth(superAdminId);
    const practice = await prisma.practice.findUniqueOrThrow({ where: { id: practiceId } });
    // Soft /me: platform cookie alone does not establish a practice user.
    const me = await request(app)
      .get('/api/auth/me')
      .set('Cookie', auth.cookie)
      .set('X-Tenant-Subdomain', practice.subdomain);
    expect(me.status).toBe(200);
    expect(me.body.user).toBeNull();

    const clinical = await request(app)
      .get('/api/patients')
      .set('Cookie', auth.cookie)
      .set('X-Tenant-Subdomain', practice.subdomain);
    expect([401, 403]).toContain(clinical.status);
  });

  it('rejects missing CSRF on authenticated mutations', async () => {
    const auth = await issuePracticeAuth({ profileId: doctorId, practiceId });
    const practice = await prisma.practice.findUniqueOrThrow({ where: { id: practiceId } });

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', auth.cookie)
      .set('X-Tenant-Subdomain', practice.subdomain);

    expect(res.status).toBe(403);
    expect(String(res.body.error || '')).toMatch(/CSRF/i);
  });

  it('rejects invalid CSRF on authenticated mutations', async () => {
    const auth = await issuePracticeAuth({ profileId: doctorId, practiceId });
    const practice = await prisma.practice.findUniqueOrThrow({ where: { id: practiceId } });

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', 'not-the-right-token')
      .set('X-Tenant-Subdomain', practice.subdomain);

    expect(res.status).toBe(403);
  });

  it('revokes session on logout and rejects replay', async () => {
    const auth = await issuePracticeAuth({ profileId: doctorId, practiceId });
    const practice = await prisma.practice.findUniqueOrThrow({ where: { id: practiceId } });

    const logout = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', auth.csrf)
      .set('X-Tenant-Subdomain', practice.subdomain);
    expect(logout.status).toBe(200);

    const me = await request(app)
      .get('/api/auth/me')
      .set('Cookie', auth.cookie)
      .set('X-Tenant-Subdomain', practice.subdomain);
    expect(me.status).toBe(401);

    const row = await prisma.practiceSession.findFirst({
      where: { tokenHash: hashToken(auth.rawToken) },
    });
    expect(row?.revokedAt).toBeTruthy();
  });

  it('revokes platform session on logout', async () => {
    const auth = await issuePlatformAuth(superAdminId);
    const logout = await request(app)
      .post('/api/super-admin/logout')
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', auth.csrf);
    expect(logout.status).toBe(200);

    const me = await request(app).get('/api/super-admin/me').set('Cookie', auth.cookie);
    expect(me.status).toBe(401);
  });

  it('stores hashed session tokens only', async () => {
    const auth = await issuePracticeAuth({ profileId: doctorId, practiceId });
    const row = await prisma.practiceSession.findFirst({
      where: { tokenHash: hashToken(auth.rawToken) },
    });
    expect(row).toBeTruthy();
    expect(row!.tokenHash).not.toBe(auth.rawToken);
    expect(row!.csrfTokenHash).not.toBe(auth.csrf);
    expect(row!.tokenHash).toBe(hashToken(auth.rawToken));
  });

  it('login sets HttpOnly practice session cookie and returns csrf_token', async () => {
    const practice = await prisma.practice.findUniqueOrThrow({ where: { id: practiceId } });
    const login = await request(app)
      .post('/api/auth/login')
      .set('X-Tenant-Subdomain', practice.subdomain)
      .send({ email: `doc-${suffix}@medspace.test`, password: 'TestPass123!' });

    expect(login.status).toBe(200);
    expect(login.body.csrf_token).toBeTruthy();
    expect(login.body.token).toBeUndefined();
    const setCookie = login.headers['set-cookie'] || [];
    expect(setCookie.some((c: string) => c.startsWith(`${PRACTICE_SESSION_COOKIE}=`))).toBe(true);
    expect(setCookie.some((c: string) => /HttpOnly/i.test(c))).toBe(true);
  });

  it('platform login sets platform cookie not practice cookie', async () => {
    const login = await request(app)
      .post('/api/super-admin/login')
      .send({ email: `sa-${suffix}@medspace.test`, password: 'TestPass123!' });

    expect(login.status).toBe(200);
    expect(login.body.csrf_token).toBeTruthy();
    expect(login.body.token).toBeUndefined();
    const setCookie = login.headers['set-cookie'] || [];
    expect(setCookie.some((c: string) => c.startsWith(`${PLATFORM_SESSION_COOKIE}=`))).toBe(true);
  });
});
