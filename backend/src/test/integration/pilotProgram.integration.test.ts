/**
 * Pilot programme integration tests — requires RUN_INTEGRATION=1 and PostgreSQL.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { SubscriptionStatus, UserRole } from '@prisma/client';
import { app } from '../../server';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { acceptInvitation } from '../../services/invitationService';
import {
  createPracticeWithOwnerInvite,
  grantPilotProgramAccess,
} from '../../services/saasPracticeService';
import { PILOT_PROGRAM_DURATION_MS } from '../../services/pilotProgramService';
import { assertNonProductionDatabaseUrl } from '../assertNonProductionDb';
import { issuePlatformAuth, issuePracticeAuth } from '../sessionAuth';
import { generateSecureToken, hashToken } from '../../utils/secureToken';

const RUN = Boolean(process.env.RUN_INTEGRATION);

async function assertDb(): Promise<void> {
  assertNonProductionDatabaseUrl(process.env.DATABASE_URL || env.DATABASE_URL);
  await prisma.$queryRaw`SELECT 1`;
}

describe.skipIf(!RUN)('Pilot programme integration (RUN_INTEGRATION=1)', () => {
  const suffix = `pilot-${Date.now()}`;
  let superAdminId = '';
  let platformAuth = { cookie: '', csrf: '' };

  beforeAll(async () => {
    await assertDb();
    const admin = await prisma.superAdmin.create({
      data: {
        email: `pilot-admin-${suffix}@example.com`,
        name: 'Pilot Admin',
        passwordHash: await bcrypt.hash('PilotAdmin123!', 10),
      },
    });
    superAdminId = admin.id;
    platformAuth = await issuePlatformAuth(superAdminId);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { practice: { subdomain: { contains: suffix } } },
    });
    await prisma.practiceInvitation.deleteMany({
      where: { practice: { subdomain: { contains: suffix } } },
    });
    await prisma.profile.deleteMany({
      where: { practice: { subdomain: { contains: suffix } } },
    });
    await prisma.practice.deleteMany({ where: { subdomain: { contains: suffix } } });
    if (superAdminId) {
      await prisma.superAdmin.delete({ where: { id: superAdminId } }).catch(() => undefined);
    }
  });

  it('creates practice with pending pilot when grant_pilot_program is true', async () => {
    const result = await createPracticeWithOwnerInvite({
      clinicName: `Pilot Clinic ${suffix}`,
      subdomain: `pilot-create-${suffix}`,
      ownerFullName: 'Pilot Owner',
      ownerEmail: `owner-create-${suffix}@example.com`,
      subscriptionPlan: 'SOLO',
      grantPilotProgram: true,
      superAdminId,
    });

    expect(result.practice.pilotProgramGrantedAt).toBeTruthy();
    expect(result.practice.pilotProgramStartsAt).toBeNull();
    expect(result.practice.pilotProgramEndsAt).toBeNull();
  });

  it('grants pilot immediately for activated TRIAL practice', async () => {
    const created = await createPracticeWithOwnerInvite({
      clinicName: `Activated Pilot ${suffix}`,
      subdomain: `pilot-active-${suffix}`,
      ownerFullName: 'Active Owner',
      ownerEmail: `owner-active-${suffix}@example.com`,
      subscriptionPlan: 'SOLO',
      superAdminId,
    });

    const token = generateSecureToken();
    await prisma.practiceInvitation.update({
      where: { id: created.invitation.id },
      data: { tokenHash: hashToken(token) },
    });
    await acceptInvitation(token, 'OwnerPass123!');

    const grantRes = await request(app)
      .post(`/api/super-admin/practices/${created.practice.id}/pilot-program/grant`)
      .set('Cookie', platformAuth.cookie)
      .set('X-CSRF-Token', platformAuth.csrf);

    expect(grantRes.status).toBe(200);
    expect(grantRes.body.pilot_program.status).toBe('ACTIVE');
    expect(grantRes.body.pilot_program.ends_at).toBeTruthy();
  });

  it('returns 409 when pilot already granted', async () => {
    const created = await createPracticeWithOwnerInvite({
      clinicName: `Dup Pilot ${suffix}`,
      subdomain: `pilot-dup-${suffix}`,
      ownerFullName: 'Dup Owner',
      ownerEmail: `owner-dup-${suffix}@example.com`,
      subscriptionPlan: 'SOLO',
      grantPilotProgram: true,
      superAdminId,
    });

    const grantRes = await request(app)
      .post(`/api/super-admin/practices/${created.practice.id}/pilot-program/grant`)
      .set('Cookie', platformAuth.cookie)
      .set('X-CSRF-Token', platformAuth.csrf);

    expect(grantRes.status).toBe(409);
  });

  it('denies non-super-admin grant', async () => {
    const created = await createPracticeWithOwnerInvite({
      clinicName: `Auth Pilot ${suffix}`,
      subdomain: `pilot-auth-${suffix}`,
      ownerFullName: 'Auth Owner',
      ownerEmail: `owner-auth-${suffix}@example.com`,
      subscriptionPlan: 'SOLO',
      superAdminId,
    });

    const ownerProfile = await prisma.profile.create({
      data: {
        practiceId: created.practice.id,
        email: `practice-user-${suffix}@example.com`,
        fullName: 'Practice User',
        role: UserRole.ADMIN,
        passwordHash: await bcrypt.hash('PracticeUser123!', 10),
        isActive: true,
      },
    });
    const practiceAuth = await issuePracticeAuth(ownerProfile.id, created.practice.subdomain);

    const grantRes = await request(app)
      .post(`/api/super-admin/practices/${created.practice.id}/pilot-program/grant`)
      .set('Cookie', practiceAuth.cookie)
      .set('X-CSRF-Token', practiceAuth.csrf)
      .set('X-Tenant-Subdomain', created.practice.subdomain);

    expect([401, 403]).toContain(grantRes.status);
  });

  it('starts pending pilot on owner activation', async () => {
    const created = await createPracticeWithOwnerInvite({
      clinicName: `Pending Pilot ${suffix}`,
      subdomain: `pilot-pending-${suffix}`,
      ownerFullName: 'Pending Owner',
      ownerEmail: `owner-pending-${suffix}@example.com`,
      subscriptionPlan: 'SOLO',
      grantPilotProgram: true,
      superAdminId,
    });

    await prisma.practice.update({
      where: { id: created.practice.id },
      data: { trialEndsAt: new Date('2020-01-01T00:00:00.000Z') },
    });

    const token = generateSecureToken();
    await prisma.practiceInvitation.update({
      where: { id: created.invitation.id },
      data: { tokenHash: hashToken(token) },
    });
    await acceptInvitation(token, 'OwnerPass123!');

    const updated = await prisma.practice.findUniqueOrThrow({
      where: { id: created.practice.id },
    });
    expect(updated.pilotProgramStartsAt).toBeTruthy();
    expect(updated.pilotProgramEndsAt).toBeTruthy();
    expect(updated.trialEndsAt?.toISOString()).toBe(updated.pilotProgramEndsAt?.toISOString());

    const audit = await prisma.auditLog.findFirst({
      where: { practiceId: created.practice.id, action: 'PILOT_ACCESS_STARTED' },
    });
    expect(audit).toBeTruthy();
  });

  it('includes pilot_program in workspace serialization', async () => {
    const created = await createPracticeWithOwnerInvite({
      clinicName: `Workspace Pilot ${suffix}`,
      subdomain: `pilot-ws-${suffix}`,
      ownerFullName: 'Workspace Owner',
      ownerEmail: `owner-ws-${suffix}@example.com`,
      subscriptionPlan: 'SOLO',
      grantPilotProgram: true,
      superAdminId,
    });

    const workspaceRes = await request(app)
      .get(`/api/super-admin/practices/${created.practice.id}`)
      .set('Cookie', platformAuth.cookie)
      .set('X-CSRF-Token', platformAuth.csrf);

    expect(workspaceRes.status).toBe(200);
    expect(workspaceRes.body.pilot_program.status).toBe('PENDING_ACTIVATION');
  });

  it('rejects pilot grant when subscription is not TRIAL', async () => {
    const created = await createPracticeWithOwnerInvite({
      clinicName: `Active Sub Pilot ${suffix}`,
      subdomain: `pilot-nontrial-${suffix}`,
      ownerFullName: 'Non Trial Owner',
      ownerEmail: `owner-nontrial-${suffix}@example.com`,
      subscriptionPlan: 'SOLO',
      superAdminId,
    });

    await prisma.practice.update({
      where: { id: created.practice.id },
      data: { subscriptionStatus: SubscriptionStatus.ACTIVE },
    });

    const grantRes = await request(app)
      .post(`/api/super-admin/practices/${created.practice.id}/pilot-program/grant`)
      .set('Cookie', platformAuth.cookie)
      .set('X-CSRF-Token', platformAuth.csrf);

    expect(grantRes.status).toBe(409);
  });

  it('5. concurrent double-grant: one succeeds, second returns 409 without extending', async () => {
    const created = await createPracticeWithOwnerInvite({
      clinicName: `Concurrent Grant ${suffix}`,
      subdomain: `pilot-concurrent-${suffix}`,
      ownerFullName: 'Concurrent Owner',
      ownerEmail: `owner-concurrent-${suffix}@example.com`,
      subscriptionPlan: 'SOLO',
      superAdminId,
    });

    const results = await Promise.allSettled([
      grantPilotProgramAccess({ practiceId: created.practice.id, superAdminId }),
      grantPilotProgramAccess({ practiceId: created.practice.id, superAdminId }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      statusCode: 409,
      code: 'PILOT_ALREADY_GRANTED',
    });

    const practice = await prisma.practice.findUniqueOrThrow({
      where: { id: created.practice.id },
    });
    expect(practice.pilotProgramGrantedAt).toBeTruthy();
    expect(practice.pilotProgramStartsAt).toBeNull();
  });

  it('6. grant-vs-owner-activation race never leaves activated owner with pending pilot', async () => {
    const created = await createPracticeWithOwnerInvite({
      clinicName: `Race Pilot ${suffix}`,
      subdomain: `pilot-race-${suffix}`,
      ownerFullName: 'Race Owner',
      ownerEmail: `owner-race-${suffix}@example.com`,
      subscriptionPlan: 'SOLO',
      superAdminId,
    });

    const token = generateSecureToken();
    await prisma.practiceInvitation.update({
      where: { id: created.invitation.id },
      data: { tokenHash: hashToken(token) },
    });

    await Promise.allSettled([
      grantPilotProgramAccess({ practiceId: created.practice.id, superAdminId }),
      acceptInvitation(token, 'OwnerPass123!'),
    ]);

    const practice = await prisma.practice.findUniqueOrThrow({
      where: { id: created.practice.id },
    });

    const stuckPendingPilot =
      practice.ownerProfileId != null &&
      practice.pilotProgramGrantedAt != null &&
      practice.pilotProgramStartsAt == null;
    expect(stuckPendingPilot).toBe(false);

    if (practice.ownerProfileId && practice.pilotProgramGrantedAt) {
      expect(practice.pilotProgramStartsAt).toBeTruthy();
      expect(practice.pilotProgramEndsAt).toBeTruthy();
      expect(practice.trialEndsAt?.getTime()).toBe(practice.pilotProgramEndsAt?.getTime());
      expect(
        practice.pilotProgramEndsAt!.getTime() - practice.pilotProgramStartsAt!.getTime()
      ).toBe(PILOT_PROGRAM_DURATION_MS);
    }
  });

  it('7. normal non-pilot owner activation leaves standard 14-day trialEndsAt', async () => {
    const created = await createPracticeWithOwnerInvite({
      clinicName: `Standard Trial ${suffix}`,
      subdomain: `pilot-standard-${suffix}`,
      ownerFullName: 'Standard Owner',
      ownerEmail: `owner-standard-${suffix}@example.com`,
      subscriptionPlan: 'SOLO',
      superAdminId,
    });

    const beforeActivation = await prisma.practice.findUniqueOrThrow({
      where: { id: created.practice.id },
    });
    const placeholderTrialEndsAt = beforeActivation.trialEndsAt;

    const token = generateSecureToken();
    await prisma.practiceInvitation.update({
      where: { id: created.invitation.id },
      data: { tokenHash: hashToken(token) },
    });
    await acceptInvitation(token, 'OwnerPass123!');

    const afterActivation = await prisma.practice.findUniqueOrThrow({
      where: { id: created.practice.id },
    });
    expect(afterActivation.pilotProgramGrantedAt).toBeNull();
    expect(afterActivation.trialEndsAt?.toISOString()).toBe(placeholderTrialEndsAt?.toISOString());
  });
});
