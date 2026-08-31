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
import { PATIENT_PORTAL_INVITATION_TTL_MS } from '../../services/patientPortalInvitationService';
import { dateOnlyUtc, toDateOnlyString } from '../../services/schedulingService';

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

describe.skipIf(!RUN)('Reception-created patients and portal activation (RUN_INTEGRATION=1)', () => {
  const suffix = `rcp-${Date.now()}`;
  let practiceId = '';
  let otherPracticeId = '';
  let subdomain = '';
  let otherSubdomain = '';
  let receptionId = '';
  let doctorRowId = '';
  let receptionAuth: Awaited<ReturnType<typeof issuePracticeAuth>>;
  let otherReceptionAuth: Awaited<ReturnType<typeof issuePracticeAuth>>;
  const createdPracticeIds: string[] = [];

  beforeAll(async () => {
    await assertDb();
    subdomain = `rcp-a-${Date.now().toString(36)}`;
    const practice = await prisma.practice.create({
      data: {
        subdomain,
        clinicName: `Reception Portal A ${suffix}`,
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

    const doctorProfile = await prisma.profile.create({
      data: {
        practiceId,
        email: `doc-${suffix}@medspace.test`,
        fullName: 'Dr Test',
        role: UserRole.DOCTOR,
        passwordHash: await bcrypt.hash('TestPass123!', 10),
        isActive: true,
        activatedAt: new Date(),
        doctor: { create: { practiceId, specialization: 'GP' } },
      },
      include: { doctor: true },
    });
    doctorRowId = doctorProfile.doctor!.id;

    const reception = await prisma.profile.create({
      data: {
        practiceId,
        email: `reception-${suffix}@medspace.test`,
        fullName: 'Reception',
        role: UserRole.ADMIN,
        passwordHash: await bcrypt.hash('TestPass123!', 10),
        isActive: true,
        activatedAt: new Date(),
      },
    });
    receptionId = reception.id;
    receptionAuth = await issuePracticeAuth({ profileId: receptionId, practiceId });

    otherSubdomain = `rcp-b-${Date.now().toString(36)}`;
    const other = await prisma.practice.create({
      data: {
        subdomain: otherSubdomain,
        clinicName: `Reception Portal B ${suffix}`,
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
    const otherReception = await prisma.profile.create({
      data: {
        practiceId: otherPracticeId,
        email: `reception-b-${suffix}@medspace.test`,
        fullName: 'Other Reception',
        role: UserRole.ADMIN,
        passwordHash: await bcrypt.hash('TestPass123!', 10),
        isActive: true,
        activatedAt: new Date(),
      },
    });
    otherReceptionAuth = await issuePracticeAuth({
      profileId: otherReception.id,
      practiceId: otherPracticeId,
    });
  }, 60_000);

  afterAll(async () => {
    for (const id of createdPracticeIds) {
      await prisma.doctorAvailabilityWindow.deleteMany({ where: { doctor: { practiceId: id } } });
      await prisma.patientPortalInvitation.deleteMany({ where: { practiceId: id } });
      await prisma.appointment.deleteMany({ where: { practiceId: id } });
      await prisma.medicalRecord.deleteMany({ where: { practiceId: id } });
      await prisma.patient.deleteMany({ where: { practiceId: id } });
      await prisma.practiceSession.deleteMany({ where: { practiceId: id } });
      await prisma.doctor.deleteMany({ where: { practiceId: id } });
      await prisma.profile.deleteMany({ where: { practiceId: id } });
      await prisma.practice.delete({ where: { id } }).catch(() => undefined);
    }
  });

  function receptionReq(method: 'get' | 'post' | 'patch', path: string) {
    return request(app)
      [method](path)
      .set('Cookie', receptionAuth.cookie)
      .set('X-CSRF-Token', receptionAuth.csrf)
      .set('X-Tenant-Subdomain', subdomain);
  }

  it('Nomsa telephone booking → folder → invite → activate without duplicate patient', async () => {
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + 1);
    scheduledAt.setHours(10, 0, 0, 0);
    await prisma.doctorAvailabilityWindow.create({
      data: {
        doctorId: doctorRowId,
        date: dateOnlyUtc(toDateOnlyString(scheduledAt)),
        startMinute: 8 * 60,
        endMinute: 18 * 60,
      },
    });

    const beforeCount = await prisma.patient.count({
      where: { practiceId, firstName: 'Nomsa', lastName: 'Testpatient' },
    });

    const appt = await receptionReq('post', '/api/appointments').send({
      new_patient: { first_name: 'Nomsa', last_name: 'Testpatient' },
      doctor_id: doctorRowId,
      scheduled_at: scheduledAt.toISOString(),
      duration_minutes: 30,
      type: 'IN_PERSON',
      reason: 'Telephone booking',
    });
    expect(appt.status).toBe(201);
    expectNoSensitiveFields(appt.body);
    const patientId = appt.body.patient_id as string;
    expect(patientId).toBeTruthy();
    expect(appt.body.patient?.registration_source).toBe('RECEPTION_CREATED');
    expect(appt.body.patient?.portal_status).toBe('NO_PORTAL_ACCESS');
    expect(appt.body.patient?.profile_id).toBeNull();

    const createdPatient = await prisma.patient.findUniqueOrThrow({ where: { id: patientId } });
    expect(createdPatient.practiceId).toBe(practiceId);
    expect(createdPatient.registrationSource).toBe('RECEPTION_CREATED');
    const afterCount = await prisma.patient.count({
      where: { practiceId, firstName: 'Nomsa', lastName: 'Testpatient' },
    });
    expect(afterCount).toBe(beforeCount + 1);

    const listed = await receptionReq('get', '/api/patients?q=Nomsa');
    expect(listed.status).toBe(200);
    expect(listed.body.some((p: { id: string }) => p.id === patientId)).toBe(true);

    const otherList = await request(app)
      .get('/api/patients')
      .set('Cookie', otherReceptionAuth.cookie)
      .set('X-CSRF-Token', otherReceptionAuth.csrf)
      .set('X-Tenant-Subdomain', otherSubdomain);
    expect(otherList.body.some((p: { id: string }) => p.id === patientId)).toBe(false);

    const clinical = await receptionReq('get', `/api/medical-records?patient_id=${patientId}`);
    if (clinical.status === 200) {
      const rows = Array.isArray(clinical.body) ? clinical.body : clinical.body.records ?? [];
      for (const row of rows) {
        expect(row.assessment).toBeUndefined();
        expect(row.subjective).toBeUndefined();
      }
    }

    const noEmailInvite = await receptionReq('post', `/api/patients/${patientId}/portal-invitations`);
    expect(noEmailInvite.status).toBe(400);

    const patched = await receptionReq('patch', `/api/patients/${patientId}`).send({
      email: `nomsa-${suffix}@medspace.test`,
      date_of_birth: '1988-04-12',
      gender: 'FEMALE',
      phone: '0820000000',
      address: '1 Test Street',
      city: 'Mthatha',
    });
    expect(patched.status).toBe(200);
    expect(patched.body.email).toBe(`nomsa-${suffix}@medspace.test`);
    expect(patched.body.profile_id).toBeNull();

    const invite = await receptionReq('post', `/api/patients/${patientId}/portal-invitations`);
    expect(invite.status).toBe(201);
    expect(invite.body.invitation_issued).toBe(true);
    expectNoSensitiveFields(invite.body);

    const inviteRow = await prisma.patientPortalInvitation.findFirstOrThrow({
      where: { patientId, usedAt: null, revokedAt: null },
    });
    expect(inviteRow.tokenHash).toBeTruthy();
    expect(inviteRow.tokenHash).not.toContain('nomsa');

    const raw = `nomsa-activate-token-${suffix}-abcdef`;
    await prisma.patientPortalInvitation.update({
      where: { id: inviteRow.id },
      data: { tokenHash: hashToken(raw) },
    });

    const expiredRaw = `expired-${raw}`;
    const expired = await prisma.patientPortalInvitation.create({
      data: {
        practiceId,
        patientId,
        email: `nomsa-${suffix}@medspace.test`,
        tokenHash: hashToken(expiredRaw),
        expiresAt: new Date(Date.now() - 1000),
        invitedByUserId: receptionId,
      },
    });
    const expiredRes = await request(app).get(
      `/api/activations/validate?token=${encodeURIComponent(expiredRaw)}`
    );
    expect(expiredRes.status).toBe(400);

    const revokedRaw = `revoked-${raw}`;
    await prisma.patientPortalInvitation.create({
      data: {
        practiceId,
        patientId,
        email: `nomsa-${suffix}@medspace.test`,
        tokenHash: hashToken(revokedRaw),
        expiresAt: new Date(Date.now() + PATIENT_PORTAL_INVITATION_TTL_MS),
        revokedAt: new Date(),
        invitedByUserId: receptionId,
      },
    });
    const revokedRes = await request(app).get(
      `/api/activations/validate?token=${encodeURIComponent(revokedRaw)}`
    );
    expect(revokedRes.status).toBe(400);
    await prisma.patientPortalInvitation.delete({ where: { id: expired.id } });

    const wrongTenant = await request(app)
      .get(`/api/activations/validate?token=${encodeURIComponent(raw)}`)
      .set('X-Tenant-Subdomain', otherSubdomain);
    expect(wrongTenant.status).toBe(403);

    const resend = await receptionReq('post', `/api/patients/${patientId}/portal-invitations/resend`);
    expect(resend.status).toBe(200);
    const afterResend = await prisma.patientPortalInvitation.findUniqueOrThrow({
      where: { id: inviteRow.id },
    });
    expect(afterResend.revokedAt).toBeTruthy();

    const fresh = await prisma.patientPortalInvitation.findFirstOrThrow({
      where: { patientId, usedAt: null, revokedAt: null },
    });
    const activateRaw = `fresh-activate-${suffix}-xyz12345`;
    await prisma.patientPortalInvitation.update({
      where: { id: fresh.id },
      data: { tokenHash: hashToken(activateRaw) },
    });

    const conflict = await request(app)
      .post('/api/auth/register')
      .set('X-Tenant-Subdomain', subdomain)
      .send({
        email: `nomsa-${suffix}@medspace.test`,
        password: 'SecurePass123!',
        full_name: 'Nomsa Duplicate',
      });
    expect(conflict.status).toBe(409);

    const accept = await request(app)
      .post('/api/activations/accept')
      .set('X-Tenant-Subdomain', subdomain)
      .send({ token: activateRaw, password: 'SecurePass123!' });
    expect(accept.status).toBe(201);
    expect(accept.body.csrf_token).toBeTruthy();
    expectNoSensitiveFields(accept.body);

    const same = await prisma.patient.findUniqueOrThrow({ where: { id: patientId } });
    expect(same.profileId).toBeTruthy();
    expect(same.portalStatus).toBe('ACTIVE');
    expect(same.registrationSource).toBe('RECEPTION_CREATED');

    const count = await prisma.patient.count({
      where: { practiceId, firstName: 'Nomsa', lastName: 'Testpatient' },
    });
    expect(count).toBe(1);

    const apptStill = await prisma.appointment.findFirstOrThrow({
      where: { id: appt.body.id },
    });
    expect(apptStill.patientId).toBe(patientId);

    const login = await request(app)
      .post('/api/auth/login')
      .set('X-Tenant-Subdomain', subdomain)
      .send({ email: `nomsa-${suffix}@medspace.test`, password: 'SecurePass123!' });
    expect(login.status).toBe(200);

    const used = await request(app)
      .post('/api/activations/accept')
      .send({ token: activateRaw, password: 'SecurePass123!' });
    expect(used.status).toBe(400);
  });

  it('does not persist a telephone patient when the slot is unavailable', async () => {
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + 3);
    scheduledAt.setHours(11, 0, 0, 0);
    const before = await prisma.patient.count({
      where: { practiceId, firstName: 'Rollback', lastName: 'Slotfail' },
    });
    const res = await receptionReq('post', '/api/appointments').send({
      new_patient: { first_name: 'Rollback', last_name: 'Slotfail' },
      doctor_id: doctorRowId,
      scheduled_at: scheduledAt.toISOString(),
      duration_minutes: 30,
      type: 'IN_PERSON',
    });
    expect(res.status).toBe(409);
    const after = await prisma.patient.count({
      where: { practiceId, firstName: 'Rollback', lastName: 'Slotfail' },
    });
    expect(after).toBe(before);
    const appts = await prisma.appointment.count({
      where: { practiceId, reason: null, doctorId: doctorRowId, scheduledAt },
    });
    expect(appts).toBe(0);
  });

  it('does not persist a telephone patient when new_patient names are invalid', async () => {
    const before = await prisma.patient.count({
      where: { practiceId, firstName: '', lastName: 'Nameless' },
    });
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + 2);
    scheduledAt.setHours(9, 0, 0, 0);
    const res = await receptionReq('post', '/api/appointments').send({
      new_patient: { first_name: '  ', last_name: 'Nameless' },
      doctor_id: doctorRowId,
      scheduled_at: scheduledAt.toISOString(),
      duration_minutes: 30,
      type: 'IN_PERSON',
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    const after = await prisma.patient.count({
      where: { practiceId, lastName: 'Nameless' },
    });
    expect(after).toBe(before);
  });

  it('does not persist a telephone patient when doctor_id is invalid', async () => {
    const before = await prisma.patient.count({
      where: { practiceId, firstName: 'Rollback', lastName: 'Baddoc' },
    });
    const res = await receptionReq('post', '/api/appointments').send({
      new_patient: { first_name: 'Rollback', last_name: 'Baddoc' },
      doctor_id: '00000000-0000-4000-8000-000000000000',
      scheduled_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      duration_minutes: 30,
      type: 'IN_PERSON',
    });
    expect([400, 404]).toContain(res.status);
    const after = await prisma.patient.count({
      where: { practiceId, firstName: 'Rollback', lastName: 'Baddoc' },
    });
    expect(after).toBe(before);
  });

  it('books an existing patient without creating another folder', async () => {
    const chart = await receptionReq('post', '/api/patients').send({
      first_name: 'Existing',
      last_name: `Book${suffix}`,
    });
    expect(chart.status).toBe(201);
    const patientId = chart.body.id as string;
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + 2);
    scheduledAt.setHours(14, 0, 0, 0);
    await prisma.doctorAvailabilityWindow.create({
      data: {
        doctorId: doctorRowId,
        date: dateOnlyUtc(toDateOnlyString(scheduledAt)),
        startMinute: 8 * 60,
        endMinute: 18 * 60,
      },
    });
    const before = await prisma.patient.count({ where: { practiceId } });
    const appt = await receptionReq('post', '/api/appointments').send({
      patient_id: patientId,
      doctor_id: doctorRowId,
      scheduled_at: scheduledAt.toISOString(),
      duration_minutes: 30,
      type: 'IN_PERSON',
      reason: 'Existing patient booking',
    });
    expect(appt.status).toBe(201);
    expect(appt.body.patient_id).toBe(patientId);
    const after = await prisma.patient.count({ where: { practiceId } });
    expect(after).toBe(before);
  });

  it('cannot create a telephone patient on another practice via new_patient', async () => {
    const beforeA = await prisma.patient.count({ where: { practiceId } });
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + 4);
    scheduledAt.setHours(9, 0, 0, 0);
    const res = await request(app)
      .post('/api/appointments')
      .set('Cookie', otherReceptionAuth.cookie)
      .set('X-CSRF-Token', otherReceptionAuth.csrf)
      .set('X-Tenant-Subdomain', otherSubdomain)
      .send({
        new_patient: { first_name: 'Tenant', last_name: 'Leak' },
        doctor_id: doctorRowId,
        scheduled_at: scheduledAt.toISOString(),
        duration_minutes: 30,
        type: 'IN_PERSON',
      });
    expect(res.status).not.toBe(201);
    const afterA = await prisma.patient.count({ where: { practiceId } });
    expect(afterA).toBe(beforeA);
    const leaked = await prisma.patient.findFirst({
      where: { practiceId, firstName: 'Tenant', lastName: 'Leak' },
    });
    expect(leaked).toBeNull();
  });

  it('self-registered patients still create an active portal account', async () => {
    const email = `self-${suffix}@medspace.test`;
    const res = await request(app)
      .post('/api/auth/register')
      .set('X-Tenant-Subdomain', subdomain)
      .send({
        email,
        password: 'SecurePass123!',
        full_name: 'Self Registered',
      });
    expect(res.status).toBe(201);
    const patient = await prisma.patient.findFirstOrThrow({
      where: { practiceId, email },
    });
    expect(patient.registrationSource).toBe('SELF_REGISTERED');
    expect(patient.portalStatus).toBe('ACTIVE');
    expect(patient.profileId).toBeTruthy();
  });
});
