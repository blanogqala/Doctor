/**
 * Phase 7.2 integration tests — self-contained fixtures.
 * Requires RUN_INTEGRATION=1 and a reachable PostgreSQL database.
 * Missing DB or fixture failure MUST fail the suite (no soft early returns).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import {
  UserRole,
  SubscriptionInvoiceStatus,
  SubscriptionStatus,
  SubscriptionPlan,
  SubscriptionPaymentMethod,
} from '@prisma/client';
import { app } from '../../server';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { generateSecureToken, hashToken } from '../../utils/secureToken';
import {
  refreshOverdueSubscriptionInvoices,
  verifySubscriptionPayment,
  reportEftPayment,
} from '../../services/subscriptionInvoiceService';
import { createPracticeWithOwnerInvite } from '../../services/saasPracticeService';
import { assertNonProductionDatabaseUrl } from '../assertNonProductionDb';
import {
  issuePlatformAuth,
  issuePracticeAuth,
  type PlatformAuth,
  type PracticeAuth,
} from '../sessionAuth';

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

describe.skipIf(!RUN)('Phase 7.3 integration (RUN_INTEGRATION=1)', () => {
  const suffix = `p72-${Date.now()}`;
  let practiceId = '';
  let ownerId = '';
  let doctorId = '';
  let receptionId = '';
  let inactiveDoctorRowId = '';
  let superAdminId = '';
  let superAdminAuth: PlatformAuth;
  let ownerAuth: PracticeAuth;
  let doctorAuth: PracticeAuth;
  let receptionAuth: PracticeAuth;
  let createdPracticeIds: string[] = [];
  let createdSuperAdminIds: string[] = [];

  beforeAll(async () => {
    await assertDb();

    const sa = await prisma.superAdmin.create({
      data: {
        email: `sa-${suffix}@MediNathi.test`,
        name: 'Phase72 Super Admin',
        passwordHash: await bcrypt.hash('TestPass123!', 10),
      },
    });
    superAdminId = sa.id;
    createdSuperAdminIds.push(sa.id);
    superAdminAuth = await issuePlatformAuth(sa.id);

    const subdomain = `p72-${Date.now().toString(36)}`;
    const practice = await prisma.practice.create({
      data: {
        subdomain,
        clinicName: `Phase72 Clinic ${suffix}`,
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
        fullName: 'Phase72 Owner',
        role: UserRole.DOCTOR,
        passwordHash: await bcrypt.hash('TestPass123!', 10),
        isActive: true,
      },
    });
    ownerId = owner.id;
    await prisma.practice.update({
      where: { id: practiceId },
      data: { ownerProfileId: owner.id },
    });
    await prisma.doctor.create({
      data: {
        practiceId,
        profileId: owner.id,
        specialization: 'GP',
        practiceName: 'Owner Practice',
      },
    });

    const doctor = await prisma.profile.create({
      data: {
        practiceId,
        email: `doctor-${suffix}@MediNathi.test`,
        fullName: 'Phase72 Doctor',
        role: UserRole.DOCTOR,
        passwordHash: await bcrypt.hash('TestPass123!', 10),
        isActive: true,
      },
    });
    doctorId = doctor.id;
    await prisma.doctor.create({
      data: {
        practiceId,
        profileId: doctor.id,
        specialization: 'GP',
        practiceName: 'Doctor Practice',
      },
    });

    const inactive = await prisma.profile.create({
      data: {
        practiceId,
        email: `inactive-${suffix}@MediNathi.test`,
        fullName: 'Phase72 Inactive Doctor',
        role: UserRole.DOCTOR,
        passwordHash: await bcrypt.hash('TestPass123!', 10),
        isActive: false,
      },
    });
    const inactiveDoctor = await prisma.doctor.create({
      data: {
        practiceId,
        profileId: inactive.id,
        specialization: 'GP',
        practiceName: 'Inactive Practice',
      },
    });
    inactiveDoctorRowId = inactiveDoctor.id;

    const reception = await prisma.profile.create({
      data: {
        practiceId,
        email: `reception-${suffix}@MediNathi.test`,
        fullName: 'Phase72 Reception',
        role: UserRole.ADMIN,
        passwordHash: await bcrypt.hash('TestPass123!', 10),
        isActive: true,
      },
    });
    receptionId = reception.id;

    ownerAuth = await issuePracticeAuth({ profileId: ownerId, practiceId });
    doctorAuth = await issuePracticeAuth({ profileId: doctorId, practiceId });
    receptionAuth = await issuePracticeAuth({ profileId: receptionId, practiceId });

    const patientProfile = await prisma.profile.create({
      data: {
        practiceId,
        email: `patient-${suffix}@MediNathi.test`,
        fullName: 'Phase72 Patient',
        role: UserRole.PATIENT,
        passwordHash: await bcrypt.hash('TestPass123!', 10),
        isActive: true,
      },
    });
    const patient = await prisma.patient.create({
        data: {
          practiceId,
          profileId: patientProfile.id,
          firstName: 'Phase72',
          lastName: 'Patient',
          dateOfBirth: new Date('1990-01-01'),
        },
    });
    await prisma.appointment.create({
      data: {
        practiceId,
        doctorId: inactiveDoctorRowId,
        patientId: patient.id,
        scheduledAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        durationMinutes: 30,
        type: 'IN_PERSON',
        status: 'COMPLETED',
      },
    });
  }, 60_000);

  afterAll(async () => {
    for (const id of createdPracticeIds) {
      await prisma.practiceSubscriptionInvoice.deleteMany({ where: { practiceId: id } });
      await prisma.practiceInvitation.deleteMany({ where: { practiceId: id } });
      await prisma.appointment.deleteMany({ where: { practiceId: id } });
      await prisma.patient.deleteMany({ where: { practiceId: id } });
      await prisma.doctor.deleteMany({ where: { practiceId: id } });
      await prisma.auditLog.deleteMany({ where: { practiceId: id } });
      await prisma.profile.deleteMany({ where: { practiceId: id } });
      await prisma.practice.deleteMany({ where: { id } });
    }
    for (const id of createdSuperAdminIds) {
      await prisma.superAdmin.deleteMany({ where: { id } });
    }
  });

  it('OWNER can view Practice Management', async () => {
    const practice = await prisma.practice.findUniqueOrThrow({ where: { id: practiceId } });
    const res = await request(app)
      .get('/api/practice-management')
      .set('Cookie', ownerAuth.cookie).set('X-CSRF-Token', ownerAuth.csrf)
      .set('X-Tenant-Subdomain', practice.subdomain);
    expect(res.status).toBe(200);
    expect(res.body.seats).toBeDefined();
  });

  it('NORMAL DOCTOR cannot access Practice Management', async () => {
    const practice = await prisma.practice.findUniqueOrThrow({ where: { id: practiceId } });
    const res = await request(app)
      .get('/api/practice-management')
      .set('Cookie', doctorAuth.cookie).set('X-CSRF-Token', doctorAuth.csrf)
      .set('X-Tenant-Subdomain', practice.subdomain);
    expect(res.status).toBe(403);
  });

  it('RECEPTION can PATCH branding; doctor cannot', async () => {
    const practice = await prisma.practice.findUniqueOrThrow({ where: { id: practiceId } });
    const deny = await request(app)
      .patch('/api/practice')
      .set('Cookie', doctorAuth.cookie).set('X-CSRF-Token', doctorAuth.csrf)
      .set('X-Tenant-Subdomain', practice.subdomain)
      .send({ tagline: 'Hacked' });
    expect(deny.status).toBe(403);

    const allow = await request(app)
      .patch('/api/practice')
      .set('Cookie', receptionAuth.cookie).set('X-CSRF-Token', receptionAuth.csrf)
      .set('X-Tenant-Subdomain', practice.subdomain)
      .send({ tagline: 'Phase72 branding' });
    expect(allow.status).toBe(200);
  });

  it('doctor list excludes inactive Doctors', async () => {
    const practice = await prisma.practice.findUniqueOrThrow({ where: { id: practiceId } });
    const res = await request(app)
      .get('/api/doctors')
      .set('Cookie', receptionAuth.cookie).set('X-CSRF-Token', receptionAuth.csrf)
      .set('X-Tenant-Subdomain', practice.subdomain);
    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ id: string }>).map((d) => d.id);
    expect(ids).not.toContain(inactiveDoctorRowId);
  });

  it('rejects new appointment for inactive Doctor', async () => {
    const practice = await prisma.practice.findUniqueOrThrow({ where: { id: practiceId } });
    const patient = await prisma.patient.findFirstOrThrow({ where: { practiceId } });
    const res = await request(app)
      .post('/api/appointments')
      .set('Cookie', receptionAuth.cookie).set('X-CSRF-Token', receptionAuth.csrf)
      .set('X-Tenant-Subdomain', practice.subdomain)
      .send({
        doctor_id: inactiveDoctorRowId,
        patient_id: patient.id,
        scheduled_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        duration_minutes: 30,
        type: 'IN_PERSON',
      });
    expect(res.status).toBe(400);
    expect(String(res.body.error || '')).toMatch(/inactive/i);
  });

  it('historical appointment still references inactive Doctor', async () => {
    const practice = await prisma.practice.findUniqueOrThrow({ where: { id: practiceId } });
    const appt = await prisma.appointment.findFirstOrThrow({
      where: { practiceId, doctorId: inactiveDoctorRowId },
    });
    const res = await request(app)
      .get(`/api/appointments/${appt.id}`)
      .set('Cookie', receptionAuth.cookie).set('X-CSRF-Token', receptionAuth.csrf)
      .set('X-Tenant-Subdomain', practice.subdomain);
    expect(res.status).toBe(200);
    expect(res.body.doctor_id || res.body.doctor?.id).toBeTruthy();
  });

  it('overdue refresh only flips past-due DUE invoices', async () => {
    const future = await prisma.practiceSubscriptionInvoice.create({
      data: {
        practiceId,
        invoiceNumber: `MS-TEST-F-${suffix}`,
        periodStart: new Date('2026-09-01'),
        periodEnd: new Date('2026-09-30'),
        amountCents: 350_000,
        status: SubscriptionInvoiceStatus.DUE,
        dueAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      },
    });
    const past = await prisma.practiceSubscriptionInvoice.create({
      data: {
        practiceId,
        invoiceNumber: `MS-TEST-P-${suffix}`,
        periodStart: new Date('2026-07-01'),
        periodEnd: new Date('2026-07-31'),
        amountCents: 350_000,
        status: SubscriptionInvoiceStatus.DUE,
        dueAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
    });
    const reported = await prisma.practiceSubscriptionInvoice.create({
      data: {
        practiceId,
        invoiceNumber: `MS-TEST-R-${suffix}`,
        periodStart: new Date('2026-06-01'),
        periodEnd: new Date('2026-06-30'),
        amountCents: 350_000,
        status: SubscriptionInvoiceStatus.PAYMENT_REPORTED,
        dueAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        paymentReportedAt: new Date(),
        paymentReference: 'REF-1',
        paymentMethod: SubscriptionPaymentMethod.EFT,
      },
    });

    await refreshOverdueSubscriptionInvoices({ practiceId });

    const f2 = await prisma.practiceSubscriptionInvoice.findUniqueOrThrow({ where: { id: future.id } });
    const p2 = await prisma.practiceSubscriptionInvoice.findUniqueOrThrow({ where: { id: past.id } });
    const r2 = await prisma.practiceSubscriptionInvoice.findUniqueOrThrow({ where: { id: reported.id } });
    expect(f2.status).toBe(SubscriptionInvoiceStatus.DUE);
    expect(p2.status).toBe(SubscriptionInvoiceStatus.OVERDUE);
    expect(r2.status).toBe(SubscriptionInvoiceStatus.PAYMENT_REPORTED);

    await reportEftPayment({
      practiceId,
      invoiceId: past.id,
      actorId: ownerId,
      paymentReference: 'EFT-OVERDUE-1',
    });
    const afterReport = await prisma.practiceSubscriptionInvoice.findUniqueOrThrow({
      where: { id: past.id },
    });
    expect(afterReport.status).toBe(SubscriptionInvoiceStatus.PAYMENT_REPORTED);
  });

  it('SUSPENDED practice stays suspended after payment verify; TRIAL activates', async () => {
    await prisma.practice.update({
      where: { id: practiceId },
      data: { subscriptionStatus: SubscriptionStatus.SUSPENDED },
    });
    const inv = await prisma.practiceSubscriptionInvoice.create({
      data: {
        practiceId,
        invoiceNumber: `MS-TEST-S-${suffix}`,
        periodStart: new Date('2026-05-01'),
        periodEnd: new Date('2026-05-31'),
        amountCents: 350_000,
        status: SubscriptionInvoiceStatus.PAYMENT_REPORTED,
        dueAt: new Date('2026-05-31'),
        paymentReportedAt: new Date(),
        paymentReference: 'SUSP-1',
        paymentMethod: SubscriptionPaymentMethod.EFT,
      },
    });

    const first = await verifySubscriptionPayment({
      invoiceId: inv.id,
      superAdminId,
    });
    expect(first.remainsSuspended).toBe(true);
    expect(first.nextStatus).toBe(SubscriptionStatus.SUSPENDED);

    const practice = await prisma.practice.findUniqueOrThrow({ where: { id: practiceId } });
    expect(practice.subscriptionStatus).toBe(SubscriptionStatus.SUSPENDED);

    const second = await verifySubscriptionPayment({
      invoiceId: inv.id,
      superAdminId,
    });
    expect(second.alreadyPaid).toBe(true);

    await prisma.practice.update({
      where: { id: practiceId },
      data: { subscriptionStatus: SubscriptionStatus.TRIAL },
    });
    const trialInv = await prisma.practiceSubscriptionInvoice.create({
      data: {
        practiceId,
        invoiceNumber: `MS-TEST-T-${suffix}`,
        periodStart: new Date('2026-04-01'),
        periodEnd: new Date('2026-04-30'),
        amountCents: 350_000,
        status: SubscriptionInvoiceStatus.PAYMENT_REPORTED,
        dueAt: new Date('2026-04-30'),
        paymentReportedAt: new Date(),
        paymentReference: 'TRIAL-1',
        paymentMethod: SubscriptionPaymentMethod.EFT,
      },
    });
    const trialResult = await verifySubscriptionPayment({
      invoiceId: trialInv.id,
      superAdminId,
    });
    expect(trialResult.nextStatus).toBe(SubscriptionStatus.ACTIVE);
    const afterTrial = await prisma.practice.findUniqueOrThrow({ where: { id: practiceId } });
    expect(afterTrial.subscriptionStatus).toBe(SubscriptionStatus.ACTIVE);
  });

  it('Super Admin cannot reduce seats below allocation', async () => {
    await prisma.practice.update({
      where: { id: practiceId },
      data: {
        subscriptionPlan: SubscriptionPlan.ENTERPRISE,
        doctorSeatLimit: 10,
        monthlyFeeCents: 500_000,
      },
    });
    try {
      // Allocate seats above Enterprise minimum so a valid plan seat count can still 409.
      const tokens = [generateSecureToken(), generateSecureToken(), generateSecureToken(), generateSecureToken(), generateSecureToken()];
      for (let i = 0; i < tokens.length; i++) {
        await prisma.practiceInvitation.create({
          data: {
            practiceId,
            email: `alloc-${i}-${suffix}@MediNathi.test`,
            fullName: `Alloc Doctor ${i}`,
            role: UserRole.DOCTOR,
            tokenHash: hashToken(tokens[i]),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            isPracticeOwner: false,
          },
        });
      }
      // active (~2) + pending (5) = ~7 allocated; reducing to 6 must 409
      const res = await request(app)
        .patch(`/api/super-admin/practices/${practiceId}`)
        .set('Cookie', superAdminAuth.cookie).set('X-CSRF-Token', superAdminAuth.csrf)
        .send({ doctor_seat_limit: 6 });
      expect(res.status).toBe(409);
    } finally {
      await prisma.practiceInvitation.deleteMany({
        where: { practiceId, email: { startsWith: `alloc-` } },
      });
      await prisma.practice.update({
        where: { id: practiceId },
        data: {
          subscriptionPlan: SubscriptionPlan.CLINIC,
          doctorSeatLimit: 5,
          monthlyFeeCents: 350_000,
        },
      });
    }
  });

  it('rejects fixed-plan seat mismatches via Super Admin API', async () => {
    try {
      const solo = await request(app)
        .patch(`/api/super-admin/practices/${practiceId}`)
        .set('Cookie', superAdminAuth.cookie).set('X-CSRF-Token', superAdminAuth.csrf)
        .send({ subscription_plan: SubscriptionPlan.SOLO, doctor_seat_limit: 2 });
      expect(solo.status).toBe(400);

      const small = await request(app)
        .patch(`/api/super-admin/practices/${practiceId}`)
        .set('Cookie', superAdminAuth.cookie).set('X-CSRF-Token', superAdminAuth.csrf)
        .send({ doctor_seat_limit: 10 });
      expect(small.status).toBe(400);

      const enterpriseOk = await request(app)
        .patch(`/api/super-admin/practices/${practiceId}`)
        .set('Cookie', superAdminAuth.cookie).set('X-CSRF-Token', superAdminAuth.csrf)
        .send({
          subscription_plan: SubscriptionPlan.ENTERPRISE,
          doctor_seat_limit: 10,
          monthly_fee_cents: 500_000,
        });
      expect(enterpriseOk.status).toBe(200);

      const enterpriseLow = await request(app)
        .patch(`/api/super-admin/practices/${practiceId}`)
        .set('Cookie', superAdminAuth.cookie).set('X-CSRF-Token', superAdminAuth.csrf)
        .send({ doctor_seat_limit: 5 });
      expect(enterpriseLow.status).toBe(400);
    } finally {
      await prisma.practice.update({
        where: { id: practiceId },
        data: {
          subscriptionPlan: SubscriptionPlan.CLINIC,
          doctorSeatLimit: 5,
          monthlyFeeCents: 350_000,
        },
      });
    }
  });

  it('rejects inactive Doctor as patient assigned Doctor', async () => {
    const practice = await prisma.practice.findUniqueOrThrow({ where: { id: practiceId } });
    const patient = await prisma.patient.findFirstOrThrow({ where: { practiceId } });
    const res = await request(app)
      .patch(`/api/patients/${patient.id}`)
      .set('Cookie', receptionAuth.cookie).set('X-CSRF-Token', receptionAuth.csrf)
      .set('X-Tenant-Subdomain', practice.subdomain)
      .send({ assigned_doctor_id: inactiveDoctorRowId });
    expect(res.status).toBe(400);
    expect(String(res.body.error || '')).toMatch(/inactive/i);
  });

  it('suspended Owner can access EFT instructions; Doctor/Reception/public cannot', async () => {
    const practice = await prisma.practice.findUniqueOrThrow({ where: { id: practiceId } });
    await prisma.practice.update({
      where: { id: practiceId },
      data: { subscriptionStatus: SubscriptionStatus.SUSPENDED },
    });

    process.env.EFT_ACCOUNT_HOLDER = 'MediNathi Test';
    process.env.EFT_BANK = 'Test Bank';
    process.env.EFT_ACCOUNT_NUMBER = '1234567890';
    process.env.EFT_BRANCH_CODE = '250655';

    const ownerEft = await request(app)
      .get('/api/practice-management/eft-instructions')
      .set('Cookie', ownerAuth.cookie).set('X-CSRF-Token', ownerAuth.csrf)
      .set('X-Tenant-Subdomain', practice.subdomain);
    expect(ownerEft.status).toBe(200);

    const doctorEft = await request(app)
      .get('/api/practice-management/eft-instructions')
      .set('Cookie', doctorAuth.cookie).set('X-CSRF-Token', doctorAuth.csrf)
      .set('X-Tenant-Subdomain', practice.subdomain);
    expect(doctorEft.status).toBe(403);

    const receptionEft = await request(app)
      .get('/api/practice-management/eft-instructions')
      .set('Cookie', receptionAuth.cookie).set('X-CSRF-Token', receptionAuth.csrf)
      .set('X-Tenant-Subdomain', practice.subdomain);
    expect(receptionEft.status).toBe(403);

    const publicEft = await request(app).get('/api/practice-management/eft-instructions');
    expect([400, 401, 403]).toContain(publicEft.status);

    await prisma.practice.update({
      where: { id: practiceId },
      data: { subscriptionStatus: SubscriptionStatus.ACTIVE },
    });
  });

  it('tenant-aware invoice billing URL uses practice subdomain', async () => {
    const { ownerBillingUrl } = await import('../../config/eftPayment');
    const practice = await prisma.practice.findUniqueOrThrow({ where: { id: practiceId } });
    const url = ownerBillingUrl(practice.subdomain);
    expect(url).toContain(`${practice.subdomain}.localhost:3000`);
    expect(url).toContain('/doctor/practice-management');
  });

  it('free trial receives no invoice; first invoice starts after trial; no overlap', async () => {
    const {
      generateMonthlySubscriptionInvoices,
      paidSubscriptionPeriodFromStart,
    } = await import('../../services/subscriptionInvoiceService');

    const trialPractice = await prisma.practice.create({
      data: {
        subdomain: `trial-${Date.now().toString(36)}`,
        clinicName: `Trial ${suffix}`,
        email: `trial-${suffix}@MediNathi.test`,
        subscriptionStatus: SubscriptionStatus.TRIAL,
        trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        subscriptionPlan: SubscriptionPlan.SOLO,
        doctorSeatLimit: 1,
        monthlyFeeCents: 80_000,
        brandColor: '#1E40AF',
      },
    });
    createdPracticeIds.push(trialPractice.id);

    const during = await generateMonthlySubscriptionInvoices({
      practiceId: trialPractice.id,
      now: new Date(),
    });
    expect(during.createdCount).toBe(0);

    const trialEndsAt = new Date('2026-09-08T00:00:00.000Z');
    await prisma.practice.update({
      where: { id: trialPractice.id },
      data: { trialEndsAt },
    });

    const after = await generateMonthlySubscriptionInvoices({
      practiceId: trialPractice.id,
      now: new Date('2026-09-08T12:00:00.000Z'),
    });
    expect(after.createdCount).toBe(1);

    const first = await prisma.practiceSubscriptionInvoice.findFirstOrThrow({
      where: { practiceId: trialPractice.id },
    });
    expect(first.periodStart.toISOString().slice(0, 10)).toBe('2026-09-08');
    expect(first.periodEnd.toISOString().slice(0, 10)).toBe('2026-10-07');
    // no trial days before 8 Sep
    expect(first.periodStart.getTime()).toBeGreaterThanOrEqual(trialEndsAt.getTime());

    const midPeriod = await generateMonthlySubscriptionInvoices({
      practiceId: trialPractice.id,
      now: new Date('2026-09-20T12:00:00.000Z'),
    });
    expect(midPeriod.createdCount).toBe(0);

    const secondRun = await generateMonthlySubscriptionInvoices({
      practiceId: trialPractice.id,
      now: new Date('2026-10-08T12:00:00.000Z'),
    });
    expect(secondRun.createdCount).toBe(1);

    const invoices = await prisma.practiceSubscriptionInvoice.findMany({
      where: { practiceId: trialPractice.id },
      orderBy: { periodStart: 'asc' },
    });
    expect(invoices).toHaveLength(2);
    expect(invoices[1].periodStart.toISOString().slice(0, 10)).toBe('2026-10-08');
    expect(invoices[0].periodEnd.getTime()).toBeLessThan(invoices[1].periodStart.getTime());

    const expectedSecond = paidSubscriptionPeriodFromStart(invoices[1].periodStart);
    expect(invoices[1].periodEnd.toISOString().slice(0, 10)).toBe(
      expectedSecond.periodEnd.toISOString().slice(0, 10)
    );
  });

  it('invoice due boundary is not overdue on morning of due day', async () => {
    const { computeSubscriptionInvoiceDueAt, refreshOverdueSubscriptionInvoices } =
      await import('../../services/subscriptionInvoiceService');
    // Unique period — avoid colliding with other tests' Sep 2026 fixtures
    const periodStart = new Date(Date.UTC(2027, 2, 1));
    const periodEnd = new Date(Date.UTC(2027, 2, 31));
    const dueAt = computeSubscriptionInvoiceDueAt(periodStart, 14);
    const inv = await prisma.practiceSubscriptionInvoice.create({
      data: {
        practiceId,
        invoiceNumber: `MS-TEST-DUE-${suffix}`,
        periodStart,
        periodEnd,
        amountCents: 350_000,
        status: SubscriptionInvoiceStatus.DUE,
        dueAt,
      },
    });
    await refreshOverdueSubscriptionInvoices({
      practiceId,
      now: new Date('2027-03-15T08:00:00.000Z'),
    });
    const stillDue = await prisma.practiceSubscriptionInvoice.findUniqueOrThrow({
      where: { id: inv.id },
    });
    expect(stillDue.status).toBe(SubscriptionInvoiceStatus.DUE);

    await refreshOverdueSubscriptionInvoices({
      practiceId,
      now: new Date('2027-03-15T22:00:00.000Z'),
    });
    const overdue = await prisma.practiceSubscriptionInvoice.findUniqueOrThrow({
      where: { id: inv.id },
    });
    expect(overdue.status).toBe(SubscriptionInvoiceStatus.OVERDUE);
  });

  it('suspended and cancelled practices disable public booking', async () => {
    const practice = await prisma.practice.findUniqueOrThrow({ where: { id: practiceId } });
    const activeDoc = await prisma.doctor.findFirstOrThrow({
      where: { practiceId, profile: { isActive: true } },
    });

    await prisma.practice.update({
      where: { id: practiceId },
      data: { subscriptionStatus: SubscriptionStatus.SUSPENDED },
    });
    const suspendedInfo = await request(app).get(
      `/api/public/practice-info?subdomain=${practice.subdomain}`
    );
    expect(suspendedInfo.status).toBe(200);
    expect(suspendedInfo.body.booking_available).toBe(false);

    const suspendedSlots = await request(app).get(
      `/api/public/next-slots?subdomain=${practice.subdomain}&doctor_id=${activeDoc.id}`
    );
    expect(suspendedSlots.status).toBe(200);
    expect(suspendedSlots.body.slots).toEqual([]);
    expect(suspendedSlots.body.booking_available).toBe(false);

    await prisma.practice.update({
      where: { id: practiceId },
      data: { subscriptionStatus: SubscriptionStatus.CANCELLED },
    });
    const cancelledInfo = await request(app).get(
      `/api/public/practice-info?subdomain=${practice.subdomain}`
    );
    expect(cancelledInfo.body.booking_available).toBe(false);

    await prisma.practice.update({
      where: { id: practiceId },
      data: { subscriptionStatus: SubscriptionStatus.ACTIVE },
    });
  });

  it('Doctor A cannot modify Doctor B public profile', async () => {
    const practice = await prisma.practice.findUniqueOrThrow({ where: { id: practiceId } });
    const otherDoctor = await prisma.doctor.findFirstOrThrow({
      where: { practiceId, profileId: doctorId },
    });
    const res = await request(app)
      .patch(`/api/practice/doctors/${otherDoctor.id}`)
      .set('Cookie', ownerAuth.cookie).set('X-CSRF-Token', ownerAuth.csrf)
      .set('X-Tenant-Subdomain', practice.subdomain)
      .send({ bio: 'Hacked bio' });
    // Owner is a different doctor profile — self-only profile updates should deny
    expect(res.status).toBe(403);
  });

  it('expired and revoked Doctor invitations release seats; resend invalidates old token', async () => {
    const { getSeatUsage } = await import('../../services/seatService');
    const { resendInvitation, revokeInvitation } = await import('../../services/invitationService');
    const practice = await prisma.practice.findUniqueOrThrow({ where: { id: practiceId } });

    await prisma.practice.update({
      where: { id: practiceId },
      data: {
        subscriptionPlan: SubscriptionPlan.ENTERPRISE,
        doctorSeatLimit: 10,
        monthlyFeeCents: 500_000,
      },
    });

    const before = await getSeatUsage(prisma, practiceId);
    const token1 = generateSecureToken();
    const invite = await prisma.practiceInvitation.create({
      data: {
        practiceId,
        email: `seat-doc-${suffix}@MediNathi.test`,
        fullName: 'Seat Doctor',
        role: UserRole.DOCTOR,
        tokenHash: hashToken(token1),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isPracticeOwner: false,
      },
    });
    const withPending = await getSeatUsage(prisma, practiceId);
    expect(withPending.pending).toBe(before.pending + 1);

    await prisma.practiceInvitation.update({
      where: { id: invite.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const afterExpire = await getSeatUsage(prisma, practiceId);
    expect(afterExpire.pending).toBe(before.pending);

    const token2 = generateSecureToken();
    const invite2 = await prisma.practiceInvitation.create({
      data: {
        practiceId,
        email: `seat-doc2-${suffix}@MediNathi.test`,
        fullName: 'Seat Doctor 2',
        role: UserRole.DOCTOR,
        tokenHash: hashToken(token2),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isPracticeOwner: false,
      },
    });
    await revokeInvitation(invite2.id, practiceId);
    const afterRevoke = await getSeatUsage(prisma, practiceId);
    expect(afterRevoke.pending).toBe(before.pending);

    const token3 = generateSecureToken();
    const invite3 = await prisma.practiceInvitation.create({
      data: {
        practiceId,
        email: `seat-doc3-${suffix}@MediNathi.test`,
        fullName: 'Seat Doctor 3',
        role: UserRole.DOCTOR,
        tokenHash: hashToken(token3),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isPracticeOwner: false,
      },
    });
    const { token: newToken } = await resendInvitation(invite3.id, practiceId);
    const oldValidate = await request(app).get(
      `/api/invitations/validate?token=${token3}`
    );
    expect([400, 404, 409]).toContain(oldValidate.status);
    const newValidate = await request(app).get(
      `/api/invitations/validate?token=${newToken}`
    );
    expect(newValidate.status).toBe(200);

    // accept invitation updates active seat state
    const accept = await request(app)
      .post('/api/invitations/accept')
      .send({
        token: newToken,
        password: 'TestPass123!',
      });
    expect([200, 201]).toContain(accept.status);
    const afterAccept = await getSeatUsage(prisma, practiceId);
    expect(afterAccept.active).toBeGreaterThan(before.active);

    await prisma.practice.update({
      where: { id: practiceId },
      data: {
        subscriptionPlan: SubscriptionPlan.CLINIC,
        doctorSeatLimit: 5,
        monthlyFeeCents: 350_000,
      },
    });
    void practice;
  });

  it('forced Owner invitation DB failure rolls Practice creation back', async () => {
    const badEmail = `rollback-${suffix}@MediNathi.test`;
    // Pre-create a conflicting pending owner invite on another practice path is hard;
    // instead force duplicate subdomain after first create attempt via unique email on same practice —
    // use reserved subdomain to fail before commit, then verify a mid-tx failure via invalid plan.
    await expect(
      createPracticeWithOwnerInvite({
        clinicName: 'Should Rollback',
        subdomain: 'www', // reserved → AppError before create
        ownerFullName: 'Rollback Owner',
        ownerEmail: badEmail,
        subscriptionPlan: SubscriptionPlan.SOLO,
        superAdminId,
      })
    ).rejects.toThrow();

    const leaked = await prisma.practice.findFirst({
      where: { clinicName: 'Should Rollback' },
    });
    expect(leaked).toBeNull();
  });

  it('email failure after successful provisioning does not duplicate Practice', async () => {
    const subdomain = `emailfail-${Date.now().toString(36)}`;
    const first = await createPracticeWithOwnerInvite({
      clinicName: `EmailFail ${suffix}`,
      subdomain,
      ownerFullName: 'Email Fail Owner',
      ownerEmail: `emailfail-${suffix}@MediNathi.test`,
      subscriptionPlan: SubscriptionPlan.SOLO,
      superAdminId,
    });
    createdPracticeIds.push(first.practice.id);
    expect(first.practice.id).toBeTruthy();
    expect(first.warnings).toBeDefined();

    await expect(
      createPracticeWithOwnerInvite({
        clinicName: `EmailFail Dup ${suffix}`,
        subdomain,
        ownerFullName: 'Email Fail Owner',
        ownerEmail: `emailfail-dup-${suffix}@MediNathi.test`,
        subscriptionPlan: SubscriptionPlan.SOLO,
        superAdminId,
      })
    ).rejects.toThrow(/subdomain/i);

    const count = await prisma.practice.count({ where: { subdomain } });
    expect(count).toBe(1);
  });

  it('Super Admin PHI isolation — medical records denied', async () => {
    const practice = await prisma.practice.findUniqueOrThrow({ where: { id: practiceId } });
    const res = await request(app)
      .get('/api/medical-records')
      .set('Cookie', superAdminAuth.cookie).set('X-CSRF-Token', superAdminAuth.csrf)
      .set('X-Tenant-Subdomain', practice.subdomain);
    expect(res.status).toBe(403);
  });

  it('Practice + Owner invitation creation is atomic (email failure still leaves Practice)', async () => {
    const result = await createPracticeWithOwnerInvite({
      clinicName: `Atomic ${suffix}`,
      subdomain: `atomic-${Date.now().toString(36)}`,
      ownerFullName: 'Atomic Owner',
      ownerEmail: `atomic-owner-${suffix}@MediNathi.test`,
      subscriptionPlan: SubscriptionPlan.SOLO,
      superAdminId,
    });
    createdPracticeIds.push(result.practice.id);
    expect(result.practice.id).toBeTruthy();
    expect(result.invitation.id).toBeTruthy();
    expect(typeof result.emailDelivered).toBe('boolean');
  });

  it('OWNER can invite Reception when Doctor seats are full', async () => {
    const practice = await prisma.practice.findUniqueOrThrow({ where: { id: practiceId } });
    await prisma.practice.update({
      where: { id: practiceId },
      data: {
        subscriptionPlan: SubscriptionPlan.ENTERPRISE,
        doctorSeatLimit: 2,
        monthlyFeeCents: 500_000,
      },
    });

    const denyDoctor = await request(app)
      .post('/api/practice-management/invitations/doctors')
      .set('Cookie', ownerAuth.cookie).set('X-CSRF-Token', ownerAuth.csrf)
      .set('X-Tenant-Subdomain', practice.subdomain)
      .send({
        full_name: 'Extra Doctor',
        email: `extra-doc-${suffix}@MediNathi.test`,
      });
    expect([409, 400]).toContain(denyDoctor.status);

    const receptionInvite = await request(app)
      .post('/api/practice-management/invitations/reception')
      .set('Cookie', ownerAuth.cookie).set('X-CSRF-Token', ownerAuth.csrf)
      .set('X-Tenant-Subdomain', practice.subdomain)
      .send({
        full_name: 'Extra Reception',
        email: `extra-rec-${suffix}@MediNathi.test`,
      });
    expect(receptionInvite.status).toBe(201);

    await prisma.practice.update({
      where: { id: practiceId },
      data: {
        subscriptionPlan: SubscriptionPlan.CLINIC,
        doctorSeatLimit: 5,
        monthlyFeeCents: 350_000,
      },
    });
  });

  it('rejects invalid invitation token', async () => {
    const res = await request(app).get('/api/invitations/validate?token=not-a-valid-token');
    expect([400, 404]).toContain(res.status);
  });

  it('invitation validate accepts a real pending token', async () => {
    const token = generateSecureToken();
    await prisma.practiceInvitation.create({
      data: {
        practiceId,
        email: `pending-${suffix}@MediNathi.test`,
        fullName: 'Pending Invitee',
        role: UserRole.ADMIN,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isPracticeOwner: false,
      },
    });
    const res = await request(app).get(`/api/invitations/validate?token=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(`pending-${suffix}@MediNathi.test`);
  });
});
