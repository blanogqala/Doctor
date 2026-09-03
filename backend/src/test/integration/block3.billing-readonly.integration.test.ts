/**
 * Block 3 — healthcare-safe billing read-only.
 * Requires RUN_INTEGRATION=1 and a reachable non-production PostgreSQL database.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import {
  SubscriptionInvoiceStatus,
  SubscriptionPaymentMethod,
  SubscriptionPlan,
  SubscriptionStatus,
  SubscriptionSuspensionReason,
  UserRole,
} from '@prisma/client';
import { app } from '../../server';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { assertNonProductionDatabaseUrl } from '../assertNonProductionDb';
import { issuePlatformAuth, issuePracticeAuth, type PlatformAuth, type PracticeAuth } from '../sessionAuth';
import {
  generateMonthlySubscriptionInvoices,
  refreshOverdueSubscriptionInvoices,
  reportEftPayment,
  verifySubscriptionPayment,
} from '../../services/subscriptionInvoiceService';
import { createPracticeWithOwnerInvite } from '../../services/saasPracticeService';

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

describe.skipIf(!RUN)('Block 3 billing read-only (RUN_INTEGRATION=1)', () => {
  const suffix = `b3-${Date.now().toString(36)}`;
  const createdPracticeIds: string[] = [];
  const createdSuperAdminIds: string[] = [];

  let practiceId = '';
  let subdomain = '';
  let ownerId = '';
  let doctorId = '';
  let doctorRowId = '';
  let receptionId = '';
  let patientId = '';
  let patientProfileId = '';
  let recordId = '';
  let superAdminId = '';
  let superAdminAuth: PlatformAuth;
  let ownerAuth: PracticeAuth;
  let doctorAuth: PracticeAuth;
  let receptionAuth: PracticeAuth;
  let patientAuth: PracticeAuth;

  async function cleanupPractice(id: string) {
    await prisma.practiceSubscriptionInvoice.deleteMany({ where: { practiceId: id } });
    await prisma.practiceInvitation.deleteMany({ where: { practiceId: id } });
    await prisma.appointment.deleteMany({ where: { practiceId: id } });
    await prisma.medicalRecord.deleteMany({ where: { practiceId: id } });
    await prisma.patient.deleteMany({ where: { practiceId: id } });
    await prisma.doctor.deleteMany({ where: { practiceId: id } });
    await prisma.auditLog.deleteMany({ where: { practiceId: id } });
    await prisma.profile.deleteMany({ where: { practiceId: id } });
    await prisma.practice.deleteMany({ where: { id } });
  }

  beforeAll(async () => {
    await assertDb();

    const sa = await prisma.superAdmin.create({
      data: {
        email: `sa-${suffix}@MediNathi.test`,
        name: 'Block3 SA',
        passwordHash: await bcrypt.hash('TestPass123!', 10),
      },
    });
    superAdminId = sa.id;
    createdSuperAdminIds.push(sa.id);
    superAdminAuth = await issuePlatformAuth(sa.id);

    subdomain = `b3-${Date.now().toString(36)}`;
    const practice = await prisma.practice.create({
      data: {
        subdomain,
        clinicName: `Block3 Clinic ${suffix}`,
        email: `clinic-${suffix}@MediNathi.test`,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionPlan: SubscriptionPlan.CLINIC,
        doctorSeatLimit: 5,
        monthlyFeeCents: 350_000,
        brandColor: '#1E40AF',
      },
    });
    practiceId = practice.id;
    createdPracticeIds.push(practice.id);

    const owner = await prisma.profile.create({
      data: {
        practiceId,
        email: `owner-${suffix}@MediNathi.test`,
        fullName: 'Block3 Owner',
        role: UserRole.DOCTOR,
        passwordHash: await bcrypt.hash('TestPass123!', 10),
        isActive: true,
      },
    });
    ownerId = owner.id;
    await prisma.practice.update({ where: { id: practiceId }, data: { ownerProfileId: owner.id } });
    await prisma.doctor.create({
      data: { practiceId, profileId: owner.id, specialization: 'GP', practiceName: 'Owner Practice' },
    });

    const doctor = await prisma.profile.create({
      data: {
        practiceId,
        email: `doctor-${suffix}@MediNathi.test`,
        fullName: 'Block3 Doctor',
        role: UserRole.DOCTOR,
        passwordHash: await bcrypt.hash('TestPass123!', 10),
        isActive: true,
      },
    });
    doctorId = doctor.id;
    const doctorRow = await prisma.doctor.create({
      data: { practiceId, profileId: doctor.id, specialization: 'GP', practiceName: 'Doctor Practice' },
    });
    doctorRowId = doctorRow.id;

    const reception = await prisma.profile.create({
      data: {
        practiceId,
        email: `reception-${suffix}@MediNathi.test`,
        fullName: 'Block3 Reception',
        role: UserRole.ADMIN,
        passwordHash: await bcrypt.hash('TestPass123!', 10),
        isActive: true,
      },
    });
    receptionId = reception.id;

    const patientProfile = await prisma.profile.create({
      data: {
        practiceId,
        email: `patient-${suffix}@MediNathi.test`,
        fullName: 'Block3 Patient',
        role: UserRole.PATIENT,
        passwordHash: await bcrypt.hash('TestPass123!', 10),
        isActive: true,
      },
    });
    patientProfileId = patientProfile.id;
    const patient = await prisma.patient.create({
      data: {
        practiceId,
        profileId: patientProfile.id,
        firstName: 'Block3',
        lastName: 'Patient',
        dateOfBirth: new Date('1990-01-01'),
      },
    });
    patientId = patient.id;

    const record = await prisma.medicalRecord.create({
      data: {
        practiceId,
        patientId,
        doctorId: doctorRowId,
        chiefComplaint: 'Headache',
        isDraft: false,
      },
    });
    recordId = record.id;

    ownerAuth = await issuePracticeAuth({ profileId: ownerId, practiceId });
    doctorAuth = await issuePracticeAuth({ profileId: doctorId, practiceId });
    receptionAuth = await issuePracticeAuth({ profileId: receptionId, practiceId });
    patientAuth = await issuePracticeAuth({ profileId: patientProfileId, practiceId });
  }, 60_000);

  afterAll(async () => {
    for (const id of createdPracticeIds) {
      await cleanupPractice(id);
    }
    for (const id of createdSuperAdminIds) {
      await prisma.superAdmin.deleteMany({ where: { id } });
    }
  });

  it('overdue invoice restricts the Practice to READ_ONLY', async () => {
    const invoice = await prisma.practiceSubscriptionInvoice.create({
      data: {
        practiceId,
        invoiceNumber: `MS-B3-OD-${suffix}`,
        periodStart: new Date('2026-07-01'),
        periodEnd: new Date('2026-07-31'),
        amountCents: 350_000,
        status: SubscriptionInvoiceStatus.DUE,
        dueAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
    });

    await refreshOverdueSubscriptionInvoices({ practiceId });

    const practice = await prisma.practice.findUniqueOrThrow({ where: { id: practiceId } });
    expect(practice.subscriptionStatus).toBe(SubscriptionStatus.SUSPENDED);
    expect(practice.subscriptionSuspensionReason).toBe(SubscriptionSuspensionReason.BILLING_OVERDUE);

    const getRecord = await request(app)
      .get(`/api/medical-records/${recordId}`)
      .set('Cookie', doctorAuth.cookie)
      .set('X-Tenant-Subdomain', subdomain);
    expect(getRecord.status).toBe(200);

    const postRecord = await request(app)
      .post('/api/medical-records')
      .set('Cookie', doctorAuth.cookie)
      .set('X-CSRF-Token', doctorAuth.csrf)
      .set('X-Tenant-Subdomain', subdomain)
      .send({ patient_id: patientId, chief_complaint: 'New note' });
    expect(postRecord.status).toBe(403);
    expect(postRecord.body.code).toBe('PRACTICE_READ_ONLY');
    expect(String(postRecord.body.error)).toMatch(/overdue/i);

    const patientPost = await request(app)
      .post('/api/appointments')
      .set('Cookie', patientAuth.cookie)
      .set('X-CSRF-Token', patientAuth.csrf)
      .set('X-Tenant-Subdomain', subdomain)
      .send({});
    expect(patientPost.status).toBe(403);
    expect(patientPost.body.code).toBe('PRACTICE_READ_ONLY');
    expect(String(patientPost.body.error)).not.toMatch(/overdue|invoice|unpaid/i);

    const receptionList = await request(app)
      .get('/api/medical-records')
      .set('Cookie', receptionAuth.cookie)
      .set('X-Tenant-Subdomain', subdomain);
    expect(receptionList.status).toBe(200);

    const me = await request(app)
      .get('/api/auth/me')
      .set('Cookie', doctorAuth.cookie)
      .set('X-Tenant-Subdomain', subdomain);
    expect(me.status).toBe(200);
    expect(me.body.user.practice.access.mode).toBe('READ_ONLY');

    const reportAllowed = await request(app)
      .post(`/api/practice-management/invoices/${invoice.id}/report-payment`)
      .set('Cookie', ownerAuth.cookie)
      .set('X-CSRF-Token', ownerAuth.csrf)
      .set('X-Tenant-Subdomain', subdomain)
      .send({ payment_reference: 'REF-B3' });
    expect(reportAllowed.status).toBe(200);

    await prisma.practiceSubscriptionInvoice.delete({ where: { id: invoice.id } }).catch(() => undefined);
    await prisma.practice.update({
      where: { id: practiceId },
      data: {
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionSuspensionReason: null,
        subscriptionSuspendedAt: null,
      },
    });
  });

  it('late report restricts atomically; on-time report keeps FULL', async () => {
    const late = await prisma.practiceSubscriptionInvoice.create({
      data: {
        practiceId,
        invoiceNumber: `MS-B3-LATE-${suffix}`,
        periodStart: new Date('2026-06-01'),
        periodEnd: new Date('2026-06-30'),
        amountCents: 350_000,
        status: SubscriptionInvoiceStatus.DUE,
        dueAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });
    await reportEftPayment({
      practiceId,
      invoiceId: late.id,
      actorId: ownerId,
      paymentReference: 'LATE-REF',
    });
    const afterLate = await prisma.practice.findUniqueOrThrow({ where: { id: practiceId } });
    expect(afterLate.subscriptionStatus).toBe(SubscriptionStatus.SUSPENDED);
    expect(afterLate.subscriptionSuspensionReason).toBe(SubscriptionSuspensionReason.BILLING_OVERDUE);

    await prisma.practice.update({
      where: { id: practiceId },
      data: {
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionSuspensionReason: null,
        subscriptionSuspendedAt: null,
      },
    });
    await prisma.practiceSubscriptionInvoice.delete({ where: { id: late.id } });

    const onTime = await prisma.practiceSubscriptionInvoice.create({
      data: {
        practiceId,
        invoiceNumber: `MS-B3-ONTIME-${suffix}`,
        periodStart: new Date('2026-08-01'),
        periodEnd: new Date('2026-08-31'),
        amountCents: 350_000,
        status: SubscriptionInvoiceStatus.DUE,
        dueAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      },
    });
    await reportEftPayment({
      practiceId,
      invoiceId: onTime.id,
      actorId: ownerId,
      paymentReference: 'ONTIME-REF',
    });
    const afterOnTime = await prisma.practice.findUniqueOrThrow({ where: { id: practiceId } });
    expect(afterOnTime.subscriptionStatus).toBe(SubscriptionStatus.ACTIVE);
    await prisma.practiceSubscriptionInvoice.delete({ where: { id: onTime.id } });
  });

  it('verify remains suspended; 409 before verify; reactivate after PAID', async () => {
    const invoice = await prisma.practiceSubscriptionInvoice.create({
      data: {
        practiceId,
        invoiceNumber: `MS-B3-VFY-${suffix}`,
        periodStart: new Date('2026-05-01'),
        periodEnd: new Date('2026-05-31'),
        amountCents: 350_000,
        status: SubscriptionInvoiceStatus.DUE,
        dueAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      },
    });
    await refreshOverdueSubscriptionInvoices({ practiceId });
    await reportEftPayment({
      practiceId,
      invoiceId: invoice.id,
      actorId: ownerId,
      paymentReference: 'VFY-REF',
    });

    const blocked = await request(app)
      .patch(`/api/super-admin/practices/${practiceId}`)
      .set('Cookie', superAdminAuth.cookie)
      .set('X-CSRF-Token', superAdminAuth.csrf)
      .send({ subscription_status: 'ACTIVE' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('OUTSTANDING_SUBSCRIPTION_PAYMENT');

    const verified = await verifySubscriptionPayment({
      invoiceId: invoice.id,
      superAdminId,
    });
    expect(verified.remainsSuspended).toBe(true);
    expect(verified.invoice.status).toBe(SubscriptionInvoiceStatus.PAID);

    const stillRestricted = await prisma.practice.findUniqueOrThrow({ where: { id: practiceId } });
    expect(stillRestricted.subscriptionStatus).toBe(SubscriptionStatus.SUSPENDED);

    const reactivated = await request(app)
      .patch(`/api/super-admin/practices/${practiceId}`)
      .set('Cookie', superAdminAuth.cookie)
      .set('X-CSRF-Token', superAdminAuth.csrf)
      .send({ subscription_status: 'ACTIVE' });
    expect(reactivated.status).toBe(200);

    const me = await request(app)
      .get('/api/auth/me')
      .set('Cookie', doctorAuth.cookie)
      .set('X-Tenant-Subdomain', subdomain);
    expect(me.body.user.practice.access.mode).toBe('FULL');
  });

  it('manual suspension hard-blocks clinical GETs', async () => {
    await prisma.practice.update({
      where: { id: practiceId },
      data: {
        subscriptionStatus: SubscriptionStatus.SUSPENDED,
        subscriptionSuspensionReason: SubscriptionSuspensionReason.MANUAL,
        subscriptionSuspendedAt: new Date(),
      },
    });

    const getRecord = await request(app)
      .get(`/api/medical-records/${recordId}`)
      .set('Cookie', doctorAuth.cookie)
      .set('X-Tenant-Subdomain', subdomain);
    expect(getRecord.status).toBe(403);
    expect(getRecord.body.code).toBe('PRACTICE_SUSPENDED');

    await prisma.practice.update({
      where: { id: practiceId },
      data: {
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionSuspensionReason: null,
        subscriptionSuspendedAt: null,
      },
    });
  });

  it('PENDING_ACTIVATION Pilot is not invoiced after placeholder expiry', async () => {
    const created = await createPracticeWithOwnerInvite({
      clinicName: `Pilot Pending ${suffix}`,
      subdomain: `b3p-${Date.now().toString(36)}`,
      ownerFullName: 'Pending Owner',
      ownerEmail: `pending-owner-${suffix}@MediNathi.test`,
      subscriptionPlan: SubscriptionPlan.SOLO,
      grantPilotProgram: true,
      superAdminId,
    });
    createdPracticeIds.push(created.practice.id);
    await prisma.practice.update({
      where: { id: created.practice.id },
      data: { trialEndsAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
    });

    const result = await generateMonthlySubscriptionInvoices({
      practiceId: created.practice.id,
      now: new Date(),
    });
    expect(result.createdCount).toBe(0);
    const invoices = await prisma.practiceSubscriptionInvoice.findMany({
      where: { practiceId: created.practice.id },
    });
    expect(invoices).toHaveLength(0);

    const info = await request(app).get(
      `/api/public/practice-info?subdomain=${created.practice.subdomain}`
    );
    expect(info.status).toBe(200);
    expect(info.body.booking_available).toBe(false);
  });

  it('public booking stays available during activated trial grace and stops when billing restricted', async () => {
    const graceSub = `b3g-${Date.now().toString(36)}`;
    const grace = await prisma.practice.create({
      data: {
        subdomain: graceSub,
        clinicName: `Grace ${suffix}`,
        email: `grace-${suffix}@MediNathi.test`,
        subscriptionStatus: SubscriptionStatus.TRIAL,
        trialEndsAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        subscriptionPlan: SubscriptionPlan.SOLO,
        doctorSeatLimit: 1,
        monthlyFeeCents: 80_000,
        brandColor: '#1E40AF',
      },
    });
    createdPracticeIds.push(grace.id);
    const graceOwner = await prisma.profile.create({
      data: {
        practiceId: grace.id,
        email: `grace-owner-${suffix}@MediNathi.test`,
        fullName: 'Grace Owner',
        role: UserRole.DOCTOR,
        passwordHash: await bcrypt.hash('TestPass123!', 10),
        isActive: true,
      },
    });
    await prisma.practice.update({
      where: { id: grace.id },
      data: { ownerProfileId: graceOwner.id },
    });

    const graceInfo = await request(app).get(`/api/public/practice-info?subdomain=${graceSub}`);
    expect(graceInfo.status).toBe(200);
    expect(graceInfo.body.booking_available).toBe(true);

    await prisma.practice.update({
      where: { id: grace.id },
      data: {
        subscriptionStatus: SubscriptionStatus.SUSPENDED,
        subscriptionSuspensionReason: SubscriptionSuspensionReason.BILLING_OVERDUE,
        subscriptionSuspendedAt: new Date(),
      },
    });
    const restrictedInfo = await request(app).get(`/api/public/practice-info?subdomain=${graceSub}`);
    expect(restrictedInfo.body.booking_available).toBe(false);
  });
});
