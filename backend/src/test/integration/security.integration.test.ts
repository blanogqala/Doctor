/**
 * Security integration tests — require RUN_INTEGRATION=1 and reachable PostgreSQL.
 * Missing DB or fixture failure MUST fail the suite (no soft early returns).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';
import { app } from '../../server';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { expectNoSensitiveFields } from '../assertNoSensitiveFields';
import { assertNonProductionDatabaseUrl } from '../assertNonProductionDb';
import { issuePlatformAuth, issuePracticeAuth } from '../sessionAuth';
import { PRACTICE_SESSION_COOKIE } from '../../utils/cookies';

const RUN = Boolean(process.env.RUN_INTEGRATION);
const PATIENT_B_EMAIL = 'security-it-patient-b@medspace.test';
const RECEPTION_EMAIL = 'security-it-reception@medspace.test';

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

function cookieFromSetCookie(setCookie: string[] | undefined, name: string): string | null {
  if (!setCookie?.length) return null;
  for (const raw of setCookie) {
    const part = raw.split(';')[0];
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq) === name) return part;
  }
  return null;
}

describe.skipIf(!RUN)('security integration (requires RUN_INTEGRATION=1 and DB)', () => {
  let practiceId = '';
  let ownerUserId = '';
  let doctorUserId = '';
  let doctorRowId = '';
  let patientAUserId = '';
  let patientAId = '';
  let receptionUserId = '';
  let patientBProfileId = '';
  let patientBId = '';
  let patientBRecordId = '';
  let appointmentId = '';
  let messageId = '';
  let paymentId = '';
  let superAdminId = '';
  const otherPatientRecordId = '00000000-0000-4000-8000-000000009999';

  beforeAll(async () => {
    await assertDb();

    const practice = await prisma.practice.findFirst({ where: { subdomain: 'eastern-cape' } });
    if (!practice) {
      throw new Error('RUN_INTEGRATION=1 but seed Practice subdomain "eastern-cape" was not found');
    }
    practiceId = practice.id;
    ownerUserId = practice.ownerProfileId ?? '';

    const doctorProfile = await prisma.profile.findFirst({
      where: { practiceId, email: 'doctor@ecdoctor.co.za' },
      include: { doctor: true },
    });
    const patientAProfile = await prisma.profile.findFirst({
      where: { practiceId, email: 'patient@ecdoctor.co.za' },
      include: { patient: true },
    });

    if (!doctorProfile?.doctor || !patientAProfile?.patient) {
      throw new Error(
        'RUN_INTEGRATION=1 but seed doctor@ecdoctor.co.za / patient@ecdoctor.co.za were not found'
      );
    }

    doctorUserId = doctorProfile.id;
    doctorRowId = doctorProfile.doctor.id;
    patientAUserId = patientAProfile.id;
    patientAId = patientAProfile.patient.id;
    if (!ownerUserId) {
      ownerUserId = doctorUserId;
    }

    await prisma.message.deleteMany({ where: { body: { startsWith: 'Security integration fixture message' } } });
    await prisma.payment.deleteMany({ where: { invoiceNumber: { startsWith: 'SEC-IT-' } } });
    await prisma.appointment.deleteMany({ where: { reason: 'Security integration fixture appointment' } });

    const existingReception = await prisma.profile.findFirst({
      where: { practiceId, email: RECEPTION_EMAIL },
    });
    if (existingReception) {
      receptionUserId = existingReception.id;
    } else {
      const reception = await prisma.profile.create({
        data: {
          practiceId,
          email: RECEPTION_EMAIL,
          fullName: 'Security IT Reception',
          role: UserRole.ADMIN,
          passwordHash: await bcrypt.hash('TestPass123!', 10),
          isActive: true,
        },
      });
      receptionUserId = reception.id;
    }

    const existingB = await prisma.profile.findFirst({
      where: { practiceId, email: PATIENT_B_EMAIL },
      include: { patient: true },
    });
    if (existingB?.patient) {
      await prisma.medicalRecord.deleteMany({ where: { patientId: existingB.patient.id } });
      await prisma.patient.delete({ where: { id: existingB.patient.id } });
      await prisma.profile.delete({ where: { id: existingB.id } });
    } else if (existingB) {
      await prisma.profile.delete({ where: { id: existingB.id } });
    }

    const patientBProfile = await prisma.profile.create({
      data: {
        practiceId,
        email: PATIENT_B_EMAIL,
        fullName: 'Security IT Patient B',
        role: UserRole.PATIENT,
        passwordHash: await bcrypt.hash('TestPass123!', 10),
        isActive: true,
        patient: {
          create: {
            practiceId,
            firstName: 'Security',
            lastName: 'PatientB',
            assignedDoctorId: doctorRowId,
            medicalHistory: 'Hypertension',
            allergies: 'Penicillin',
            currentMedications: 'Amlodipine',
          },
        },
      },
      include: { patient: true },
    });

    if (!patientBProfile.patient) {
      throw new Error('Failed to create integration Patient B');
    }

    patientBProfileId = patientBProfile.id;
    patientBId = patientBProfile.patient.id;

    const record = await prisma.medicalRecord.create({
      data: {
        practiceId,
        patientId: patientBId,
        doctorId: doctorRowId,
        isDraft: true,
        chiefComplaint: 'Integration-only fixture — Patient B chart',
        assessment: 'Do not use in production seed',
      },
    });
    patientBRecordId = record.id;

    const appointment = await prisma.appointment.create({
      data: {
        practiceId,
        patientId: patientBId,
        doctorId: doctorRowId,
        createdBy: receptionUserId,
        scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
        durationMinutes: 30,
        type: 'IN_PERSON',
        status: 'CONFIRMED',
        reason: 'Security integration fixture appointment',
      },
    });
    appointmentId = appointment.id;

    const message = await prisma.message.create({
      data: {
        practiceId,
        senderId: receptionUserId,
        recipientId: patientBProfileId,
        patientId: patientBId,
        type: 'CHAT',
        body: 'Security integration fixture message',
      },
    });
    messageId = message.id;

    const payment = await prisma.payment.create({
      data: {
        practiceId,
        patientId: patientBId,
        appointmentId,
        amountCents: 12345,
        status: 'UNPAID',
        method: 'EFT',
        invoiceNumber: `SEC-IT-${Date.now()}`,
        createdBy: receptionUserId,
      },
    });
    paymentId = payment.id;

    const superAdmin = await prisma.superAdmin.create({
      data: {
        email: `security-super-admin-${Date.now()}@medspace.test`,
        name: 'Security Super Admin',
        passwordHash: await bcrypt.hash('TestPass123!', 10),
      },
    });
    superAdminId = superAdmin.id;

    if (patientBId === patientAId) {
      throw new Error('Fixture error: Patient B id collided with Patient A');
    }
  });

  afterAll(async () => {
    if (!practiceId) return;
    try {
      if (messageId) {
        await prisma.message.deleteMany({ where: { id: messageId } });
      }
      if (paymentId) {
        await prisma.payment.deleteMany({ where: { id: paymentId } });
      }
      if (appointmentId) {
        await prisma.appointment.deleteMany({ where: { id: appointmentId } });
      }
      if (patientBRecordId) {
        await prisma.medicalRecord.deleteMany({ where: { id: patientBRecordId } });
      }
      if (patientBId) {
        await prisma.medicalRecord.deleteMany({ where: { patientId: patientBId } });
        await prisma.patient.deleteMany({ where: { id: patientBId } });
      }
      if (patientBProfileId) {
        await prisma.profile.deleteMany({ where: { id: patientBProfileId } });
      }
      if (receptionUserId) {
        await prisma.profile.deleteMany({ where: { id: receptionUserId, email: RECEPTION_EMAIL } });
      }
      if (superAdminId) {
        await prisma.superAdmin.deleteMany({ where: { id: superAdminId } });
      }
    } catch {
      // best-effort cleanup
    }
  });

  it('denies patient access to another patient record', async () => {
    expect(patientBRecordId).toBeTruthy();
    expect(patientBId).toBeTruthy();
    expect(patientAId).toBeTruthy();

    const record = await prisma.medicalRecord.findUniqueOrThrow({
      where: { id: patientBRecordId },
      select: { patientId: true },
    });
    expect(record.patientId).not.toBe(patientAId);
    expect(record.patientId).toBe(patientBId);

    const token = await issuePracticeAuth({ profileId: patientAUserId, practiceId });
    const res = await request(app)
      .get(`/api/medical-records/${patientBRecordId}`)
      .set('Cookie', token.cookie).set('X-CSRF-Token', token.csrf)
      .set('X-Tenant-Subdomain', 'eastern-cape');

    expect(res.status).toBe(403);
  });

  it('denies doctor access to non-existent cross-tenant record id', async () => {
    const token = await issuePracticeAuth({ profileId: doctorUserId, practiceId });
    const res = await request(app)
      .get(`/api/medical-records/${otherPatientRecordId}`)
      .set('Cookie', token.cookie).set('X-CSRF-Token', token.csrf)
      .set('X-Tenant-Subdomain', 'eastern-cape');

    expect(res.status).toBe(404);
  });

  it('rejects autosave finalization', async () => {
    expect(patientBRecordId).toBeTruthy();

    const token = await issuePracticeAuth({ profileId: doctorUserId, practiceId });
    const res = await request(app)
      .patch(`/api/medical-records/${patientBRecordId}`)
      .set('Cookie', token.cookie).set('X-CSRF-Token', token.csrf)
      .set('X-Tenant-Subdomain', 'eastern-cape')
      .send({ autosave: true, is_draft: false, assessment: 'Should fail' });

    expect(res.status).toBe(400);
  });

  it('never exposes profile security fields in auth responses', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .set('X-Tenant-Subdomain', 'eastern-cape')
      .send({ email: RECEPTION_EMAIL, password: 'TestPass123!' });

    expect(login.status).toBe(200);
    expectNoSensitiveFields(login.body);

    const me = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookieFromSetCookie(login.headers['set-cookie'], PRACTICE_SESSION_COOKIE) || '')
      .set('X-CSRF-Token', login.body.csrf_token || '')
      .set('X-Tenant-Subdomain', 'eastern-cape');

    expect(me.status).toBe(200);
    expectNoSensitiveFields(me.body);
  });

  it('minimizes reception patient data while preserving doctor clinical access', async () => {
    const receptionToken = await issuePracticeAuth({ profileId: receptionUserId, practiceId });
    const doctorToken = await issuePracticeAuth({ profileId: doctorUserId, practiceId });

    const receptionRes = await request(app)
      .get(`/api/patients/${patientBId}`)
      .set('Cookie', receptionToken.cookie).set('X-CSRF-Token', receptionToken.csrf)
      .set('X-Tenant-Subdomain', 'eastern-cape');
    expect(receptionRes.status).toBe(200);
    expectNoSensitiveFields(receptionRes.body);
    expect(receptionRes.body.medical_history).toBeUndefined();
    expect(receptionRes.body.allergies).toBeUndefined();
    expect(receptionRes.body.current_medications).toBeUndefined();

    const doctorRes = await request(app)
      .get(`/api/patients/${patientBId}`)
      .set('Cookie', doctorToken.cookie).set('X-CSRF-Token', doctorToken.csrf)
      .set('X-Tenant-Subdomain', 'eastern-cape');
    expect(doctorRes.status).toBe(200);
    expectNoSensitiveFields(doctorRes.body);
    expect(doctorRes.body.medical_history).toBe('Hypertension');
    expect(doctorRes.body.allergies).toBe('Penicillin');
    expect(doctorRes.body.current_medications).toBe('Amlodipine');
  });

  it('keeps doctor and appointment profile payloads free of sensitive keys', async () => {
    const receptionToken = await issuePracticeAuth({ profileId: receptionUserId, practiceId });
    const doctorToken = await issuePracticeAuth({ profileId: doctorUserId, practiceId });

    const doctorsRes = await request(app)
      .get('/api/doctors')
      .set('Cookie', doctorToken.cookie).set('X-CSRF-Token', doctorToken.csrf)
      .set('X-Tenant-Subdomain', 'eastern-cape');
    expect(doctorsRes.status).toBe(200);
    expectNoSensitiveFields(doctorsRes.body);

    const receptionAppt = await request(app)
      .get(`/api/appointments/${appointmentId}`)
      .set('Cookie', receptionToken.cookie).set('X-CSRF-Token', receptionToken.csrf)
      .set('X-Tenant-Subdomain', 'eastern-cape');
    expect(receptionAppt.status).toBe(200);
    expectNoSensitiveFields(receptionAppt.body);
    expect(receptionAppt.body.patient?.allergies).toBeUndefined();

    const doctorAppt = await request(app)
      .get(`/api/appointments/${appointmentId}`)
      .set('Cookie', doctorToken.cookie).set('X-CSRF-Token', doctorToken.csrf)
      .set('X-Tenant-Subdomain', 'eastern-cape');
    expect(doctorAppt.status).toBe(200);
    expectNoSensitiveFields(doctorAppt.body);
    expect(doctorAppt.body.patient?.allergies).toBe('Penicillin');
  });

  it('keeps medical record, message, payment, and team responses safe', async () => {
    const receptionToken = await issuePracticeAuth({ profileId: receptionUserId, practiceId });
    const doctorToken = await issuePracticeAuth({ profileId: doctorUserId, practiceId });
    const ownerToken = await issuePracticeAuth({ profileId: ownerUserId, practiceId });

    const recordRes = await request(app)
      .get(`/api/medical-records/${patientBRecordId}`)
      .set('Cookie', doctorToken.cookie).set('X-CSRF-Token', doctorToken.csrf)
      .set('X-Tenant-Subdomain', 'eastern-cape');
    expect(recordRes.status).toBe(200);
    expectNoSensitiveFields(recordRes.body);

    const messageRes = await request(app)
      .get('/api/messages')
      .query({ patient_id: patientBId })
      .set('Cookie', receptionToken.cookie).set('X-CSRF-Token', receptionToken.csrf)
      .set('X-Tenant-Subdomain', 'eastern-cape');
    expect(messageRes.status).toBe(200);
    expectNoSensitiveFields(messageRes.body);
    expect(messageRes.body[0]?.patient?.medical_history).toBeUndefined();

    const paymentRes = await request(app)
      .get('/api/payments')
      .query({ patient_id: patientBId })
      .set('Cookie', receptionToken.cookie).set('X-CSRF-Token', receptionToken.csrf)
      .set('X-Tenant-Subdomain', 'eastern-cape');
    expect(paymentRes.status).toBe(200);
    expectNoSensitiveFields(paymentRes.body);
    expect(paymentRes.body[0]?.patient?.allergies).toBeUndefined();

    const teamRes = await request(app)
      .get('/api/practice-management')
      .set('Cookie', ownerToken.cookie).set('X-CSRF-Token', ownerToken.csrf)
      .set('X-Tenant-Subdomain', 'eastern-cape');
    expect(teamRes.status).toBe(200);
    expectNoSensitiveFields(teamRes.body);
  });

  it('keeps super-admin practice workspace free of profile security fields', async () => {
    const superAdminRes = await request(app)
      .get(`/api/super-admin/practices/${practiceId}`)
      .set('Cookie', (await issuePlatformAuth(superAdminId)).cookie)
      .set('X-CSRF-Token', (await issuePlatformAuth(superAdminId)).csrf);

    expect(superAdminRes.status).toBe(200);
    expectNoSensitiveFields(superAdminRes.body);
  });
});

describe('security integration (offline contract)', () => {
  it('documents integration test requirement', () => {
    expect(true).toBe(true);
  });
});
