/**
 * Invitation accept vs leftover practice session CSRF.
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
import { issuePracticeAuth } from '../sessionAuth';
import { generateSecureToken, hashToken } from '../../utils/secureToken';
import { INVITATION_TTL_MS } from '../../services/invitationService';

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

describe.skipIf(!RUN)('invitation accept CSRF (RUN_INTEGRATION=1)', () => {
  const suffix = `invcsrf-${Date.now()}`;
  let practiceId = '';
  let subdomain = '';
  let leftoverCookie = '';
  const createdPracticeIds: string[] = [];

  beforeAll(async () => {
    await assertDb();
    subdomain = `invcsrf-${Date.now().toString(36)}`;
    const practice = await prisma.practice.create({
      data: {
        subdomain,
        clinicName: `Invite CSRF ${suffix}`,
        email: `clinic-${suffix}@MediNathi.test`,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionPlan: SubscriptionPlan.CLINIC,
        doctorSeatLimit: 8,
        monthlyFeeCents: 350_000,
        brandColor: '#1E40AF',
      },
    });
    practiceId = practice.id;
    createdPracticeIds.push(practice.id);

    const existing = await prisma.profile.create({
      data: {
        practiceId,
        email: `existing-${suffix}@MediNathi.test`,
        fullName: 'Existing Reception',
        role: UserRole.ADMIN,
        passwordHash: await bcrypt.hash('TestPass123!', 10),
        isActive: true,
        activatedAt: new Date(),
      },
    });
    leftoverCookie = (await issuePracticeAuth({ profileId: existing.id, practiceId })).cookie;
  });

  afterAll(async () => {
    for (const id of createdPracticeIds) {
      await prisma.practiceInvitation.deleteMany({ where: { practiceId: id } });
      await prisma.practiceSession.deleteMany({ where: { practiceId: id } });
      await prisma.doctor.deleteMany({ where: { practiceId: id } });
      await prisma.profile.deleteMany({ where: { practiceId: id } });
      await prisma.practice.delete({ where: { id } }).catch(() => undefined);
    }
  });

  async function createPendingInvite(role: UserRole, email: string) {
    const raw = generateSecureToken();
    const invite = await prisma.practiceInvitation.create({
      data: {
        practiceId,
        email,
        fullName: role === UserRole.DOCTOR ? 'Invited Doctor' : 'Invited Reception',
        role,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        isPracticeOwner: false,
      },
    });
    return { raw, invite };
  }

  async function acceptFromPracticeOrigin(
    raw: string,
    password: string,
    extra: Record<string, string> = {}
  ) {
    return request(app)
      .post('/api/invitations/accept')
      .set('Origin', `http://${subdomain}.localhost:3000`)
      .set('Cookie', leftoverCookie)
      .set(extra)
      .send({ token: raw, password });
  }

  it('GET validate succeeds without CSRF', async () => {
    const { raw, invite } = await createPendingInvite(
      UserRole.ADMIN,
      `val-${suffix}@MediNathi.test`
    );
    const res = await request(app)
      .get(`/api/invitations/validate?token=${encodeURIComponent(raw)}`)
      .set('Origin', `http://${subdomain}.localhost:3000`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(invite.email);
    expect(res.body.role).toBe(UserRole.ADMIN);
  });

  it('POST accept from practice origin succeeds with leftover session and no CSRF header', async () => {
    const password = 'SecurePass123!';
    const { raw, invite } = await createPendingInvite(
      UserRole.ADMIN,
      `recv-${suffix}@MediNathi.test`
    );
    const stored = await prisma.practiceInvitation.findUniqueOrThrow({ where: { id: invite.id } });
    expect(stored.tokenHash).toBe(hashToken(raw));
    expect(stored.tokenHash).not.toBe(raw);

    const accept = await acceptFromPracticeOrigin(raw, password);
    expect(accept.status).toBe(201);
    expect(accept.body.csrf_token).toBeTruthy();
    expect(accept.body.user?.email).toBe(invite.email);

    const reused = await acceptFromPracticeOrigin(raw, password);
    expect(reused.status).toBeGreaterThanOrEqual(400);
    const after = await prisma.practiceInvitation.findUniqueOrThrow({ where: { id: invite.id } });
    expect(after.acceptedAt).toBeTruthy();
  });

  it('POST accept works for Doctor invitations the same way', async () => {
    const password = 'SecurePass123!';
    const { raw, invite } = await createPendingInvite(
      UserRole.DOCTOR,
      `doc-${suffix}@MediNathi.test`
    );
    const accept = await acceptFromPracticeOrigin(raw, password);
    expect(accept.status).toBe(201);
    expect(accept.body.user?.email).toBe(invite.email);

    const replay = await acceptFromPracticeOrigin(raw, password);
    expect(replay.status).toBeGreaterThanOrEqual(400);
  });

  it('authenticated practice mutations still require CSRF', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Origin', `http://${subdomain}.localhost:3000`)
      .set('X-Tenant-Subdomain', subdomain)
      .set('Cookie', leftoverCookie)
      .send({ current_password: 'TestPass123!', new_password: 'OtherPass123!' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/CSRF/i);
  });
});
