/**
 * Phase 8 Block 3 — patient activation matrix.
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
import { expectNoSensitiveFields } from '../assertNoSensitiveFields';
import { issuePracticeAuth } from '../sessionAuth';
import { hashToken } from '../../utils/secureToken';
import { PATIENT_ACTIVATION_TTL_MS } from '../../services/patientActivationService';

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

describe.skipIf(!RUN)('Block 3 patient activation (RUN_INTEGRATION=1)', () => {
  const suffix = `b3-${Date.now()}`;
  let practiceId = '';
  let otherPracticeId = '';
  let otherSubdomain = '';
  let subdomain = '';
  let receptionId = '';
  let receptionAuth: Awaited<ReturnType<typeof issuePracticeAuth>>;
  let createdPracticeIds: string[] = [];

  beforeAll(async () => {
    await assertDb();

    subdomain = `b3a-${Date.now().toString(36)}`;
    const practice = await prisma.practice.create({
      data: {
        subdomain,
        clinicName: `Block3 A ${suffix}`,
        email: `clinic-a-${suffix}@MediNathi.test`,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionPlan: SubscriptionPlan.CLINIC,
        doctorSeatLimit: 5,
        monthlyFeeCents: 350_000,
        brandColor: '#1E40AF',
      },
    });
    practiceId = practice.id;
    createdPracticeIds.push(practice.id);

    const reception = await prisma.profile.create({
      data: {
        practiceId,
        email: `reception-${suffix}@MediNathi.test`,
        fullName: 'Block3 Reception',
        role: UserRole.ADMIN,
        passwordHash: await bcrypt.hash('TestPass123!', 10),
        isActive: true,
        activatedAt: new Date(),
      },
    });
    receptionId = reception.id;
    receptionAuth = await issuePracticeAuth({ profileId: receptionId, practiceId });

    otherSubdomain = `b3b-${Date.now().toString(36)}`;
    const other = await prisma.practice.create({
      data: {
        subdomain: otherSubdomain,
        clinicName: `Block3 B ${suffix}`,
        email: `clinic-b-${suffix}@MediNathi.test`,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionPlan: SubscriptionPlan.CLINIC,
        doctorSeatLimit: 5,
        monthlyFeeCents: 350_000,
        brandColor: '#1E40AF',
      },
    });
    otherPracticeId = other.id;
    createdPracticeIds.push(other.id);
  });

  afterAll(async () => {
    try {
      for (const id of createdPracticeIds) {
        await prisma.patientPortalInvitation.deleteMany({ where: { practiceId: id } });
        await prisma.patientActivationToken.deleteMany({ where: { practiceId: id } });
        await prisma.practiceSession.deleteMany({ where: { practiceId: id } });
        await prisma.patient.deleteMany({ where: { practiceId: id } });
        await prisma.profile.deleteMany({ where: { practiceId: id } });
        await prisma.practice.delete({ where: { id } }).catch(() => undefined);
      }
    } catch {
      // best-effort
    }
  });

  async function createPendingProfile(email: string) {
    const profile = await prisma.profile.create({
      data: {
        practiceId,
        email,
        fullName: 'Pending Patient',
        role: UserRole.PATIENT,
        passwordHash: await bcrypt.hash('UnusablePass123!', 10),
        isActive: false,
        activatedAt: null,
        patient: {
          create: {
            practiceId,
            firstName: 'Pending',
            lastName: 'Patient',
            email,
            registrationSource: 'RECEPTION_CREATED',
            portalStatus: 'INVITED',
            gender: 'UNKNOWN',
          },
        },
      },
    });
    const tokenRow = await prisma.patientActivationToken.create({
      data: {
        profileId: profile.id,
        practiceId,
        tokenHash: hashToken(`seed-${email}`),
        expiresAt: new Date(Date.now() + PATIENT_ACTIVATION_TTL_MS),
      },
    });
    return { profile, tokenRow };
  }

  it('Reception chart create does not issue a portal account or session', async () => {
    const res = await request(app)
      .post('/api/patients')
      .set('Cookie', receptionAuth.cookie)
      .set('X-CSRF-Token', receptionAuth.csrf)
      .set('X-Tenant-Subdomain', subdomain)
      .send({ first_name: 'Pending', last_name: 'Patient' });
    expect(res.status).toBe(201);
    expectNoSensitiveFields(res.body);
    expect(res.body.profile_id).toBeNull();
    expect(res.body.registration_source).toBe('RECEPTION_CREATED');
    expect(res.body.portal_status).toBe('NO_PORTAL_ACCESS');
    expect(res.body.csrf_token).toBeUndefined();
    expect(res.body.activation_issued).toBeUndefined();

    const row = await prisma.patient.findFirstOrThrow({ where: { id: res.body.id } });
    expect(row.profileId).toBeNull();
  });

  it('legacy pending profile stores hashed activation token', async () => {
    const email = `pending-${suffix}@MediNathi.test`;
    const { profile, tokenRow } = await createPendingProfile(email);

    expect(profile.isActive).toBe(false);
    expect(profile.activatedAt).toBeNull();
    expect(tokenRow.tokenHash).toBeTruthy();
    expect(tokenRow.tokenHash.length).toBeGreaterThan(20);
  });

  it('rejects malformed activation token', async () => {
    const res = await request(app).get('/api/activations/validate?token=short');
    expect(res.status).toBe(400);
  });

  it('rejects expired activation token', async () => {
    const email = `expired-${suffix}@MediNathi.test`;
    const { profile } = await createPendingProfile(email);
    const raw = 'expired-activation-token-value-xyz';
    await prisma.patientActivationToken.updateMany({
      where: { profileId: profile.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await prisma.patientActivationToken.create({
      data: {
        profileId: profile.id,
        practiceId,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    const res = await request(app).get(`/api/activations/validate?token=${encodeURIComponent(raw)}`);
    expect(res.status).toBe(400);
  });

  it('rejects already-used activation token', async () => {
    const email = `used-${suffix}@MediNathi.test`;
    const { profile } = await createPendingProfile(email);
    const raw = 'used-activation-token-value-abcdef';
    await prisma.patientActivationToken.updateMany({
      where: { profileId: profile.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await prisma.patientActivationToken.create({
      data: {
        profileId: profile.id,
        practiceId,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + PATIENT_ACTIVATION_TTL_MS),
        usedAt: new Date(),
      },
    });

    const res = await request(app).get(`/api/activations/validate?token=${encodeURIComponent(raw)}`);
    expect(res.status).toBe(400);
  });

  it('resend invalidates old token and issues a new one', async () => {
    const email = `resend-${suffix}@MediNathi.test`;
    const { profile } = await createPendingProfile(email);
    const oldRaw = 'old-activation-token-before-resend-99';
    await prisma.patientActivationToken.updateMany({
      where: { profileId: profile.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    const oldRow = await prisma.patientActivationToken.create({
      data: {
        profileId: profile.id,
        practiceId,
        tokenHash: hashToken(oldRaw),
        expiresAt: new Date(Date.now() + PATIENT_ACTIVATION_TTL_MS),
      },
    });

    const okBefore = await request(app).get(
      `/api/activations/validate?token=${encodeURIComponent(oldRaw)}`
    );
    expect(okBefore.status).toBe(200);

    const resend = await request(app)
      .post(`/api/auth/admin/patients/${profile.id}/resend-activation`)
      .set('Cookie', receptionAuth.cookie)
      .set('X-CSRF-Token', receptionAuth.csrf)
      .set('X-Tenant-Subdomain', subdomain);
    expect(resend.status).toBe(200);
    expect(resend.body.activation_issued).toBe(true);
    expectNoSensitiveFields(resend.body);

    const old = await prisma.patientActivationToken.findUniqueOrThrow({ where: { id: oldRow.id } });
    expect(old.usedAt).toBeTruthy();

    const fresh = await prisma.patientActivationToken.findFirstOrThrow({
      where: { profileId: profile.id, usedAt: null },
    });
    expect(fresh.id).not.toBe(oldRow.id);
    expect(fresh.tokenHash).not.toBe(oldRow.tokenHash);

    const after = await request(app).get(
      `/api/activations/validate?token=${encodeURIComponent(oldRaw)}`
    );
    expect(after.status).toBe(400);
  });

  it('rejects activation under wrong tenant header', async () => {
    const email = `tenant-${suffix}@MediNathi.test`;
    const { profile } = await createPendingProfile(email);
    const raw = 'tenant-bound-activation-token-abcdef12';
    await prisma.patientActivationToken.updateMany({
      where: { profileId: profile.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await prisma.patientActivationToken.create({
      data: {
        profileId: profile.id,
        practiceId,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + PATIENT_ACTIVATION_TTL_MS),
      },
    });

    const res = await request(app)
      .get(`/api/activations/validate?token=${encodeURIComponent(raw)}`)
      .set('X-Tenant-Subdomain', otherSubdomain);
    expect(res.status).toBe(403);
  });

  it('rejects weak password on accept', async () => {
    const email = `weakpw-${suffix}@MediNathi.test`;
    const { profile } = await createPendingProfile(email);
    const raw = 'weak-password-activation-token-xyz99';
    await prisma.patientActivationToken.updateMany({
      where: { profileId: profile.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await prisma.patientActivationToken.create({
      data: {
        profileId: profile.id,
        practiceId,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + PATIENT_ACTIVATION_TTL_MS),
      },
    });

    const res = await request(app)
      .post('/api/activations/accept')
      .send({ token: raw, password: 'short' });
    expect(res.status).toBe(400);
    expect(String(res.body.error || '')).toMatch(/password/i);
  });

  it('activates patient, allows login, and rejects token reuse', async () => {
    const email = `activate-${suffix}@MediNathi.test`;
    const { profile } = await createPendingProfile(email);
    const raw = 'valid-activation-token-for-login-test99';
    await prisma.patientActivationToken.updateMany({
      where: { profileId: profile.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await prisma.patientActivationToken.create({
      data: {
        profileId: profile.id,
        practiceId,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + PATIENT_ACTIVATION_TTL_MS),
      },
    });

    const accept = await request(app)
      .post('/api/activations/accept')
      .set('X-Tenant-Subdomain', subdomain)
      .send({ token: raw, password: 'SecurePass123!' });
    expect(accept.status).toBe(201);
    expect(accept.body.csrf_token).toBeTruthy();
    expect(accept.body.user?.email).toBe(email);
    expectNoSensitiveFields(accept.body);

    const updated = await prisma.profile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(updated.isActive).toBe(true);
    expect(updated.activatedAt).toBeTruthy();

    const login = await request(app)
      .post('/api/auth/login')
      .set('X-Tenant-Subdomain', subdomain)
      .send({ email, password: 'SecurePass123!' });
    expect(login.status).toBe(200);
    expect(login.body.csrf_token).toBeTruthy();
    expectNoSensitiveFields(login.body);

    const reuse = await request(app)
      .post('/api/activations/accept')
      .send({ token: raw, password: 'SecurePass123!' });
    expect(reuse.status).toBe(400);
  });

  it('pending patient cannot login before activation', async () => {
    const email = `nologin-${suffix}@MediNathi.test`;
    await createPendingProfile(email);
    const login = await request(app)
      .post('/api/auth/login')
      .set('X-Tenant-Subdomain', subdomain)
      .send({ email, password: 'anything-here-1' });
    expect(login.status).toBe(403);
    expect(String(login.body.error || '')).toMatch(/activation/i);
  });
});
