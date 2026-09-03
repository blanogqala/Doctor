/**
 * Block 4 — per-Practice clinical chart access.
 * Requires RUN_INTEGRATION=1 and a reachable non-production PostgreSQL database.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import {
  ClinicalChartAccessMode,
  SubscriptionPlan,
  SubscriptionStatus,
  SubscriptionSuspensionReason,
  UserRole,
} from '@prisma/client';
import { app } from '../../server';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
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

describe.skipIf(!RUN)('Block 4 clinical chart access (RUN_INTEGRATION=1)', () => {
  const suffix = `b4-${Date.now().toString(36)}`;
  const createdPracticeIds: string[] = [];
  const createdSuperAdminIds: string[] = [];

  let practiceId = '';
  let subdomain = '';
  let otherPracticeId = '';
  let otherSubdomain = '';
  let doctorAProfileId = '';
  let doctorAId = '';
  let doctorBProfileId = '';
  let doctorBId = '';
  let otherDoctorProfileId = '';
  let receptionProfileId = '';
  let patientId = '';
  let recordAId = '';
  let superAdminId = '';
  let superAdminAuth: PlatformAuth;
  let doctorAAuth: PracticeAuth;
  let doctorBAuth: PracticeAuth;
  let otherDoctorAuth: PracticeAuth;
  let receptionAuth: PracticeAuth;

  async function cleanupPractice(id: string) {
    await prisma.consultationRecordingConsent.deleteMany({ where: { practiceId: id } });
    await prisma.prescription.deleteMany({
      where: { medicalRecord: { practiceId: id } },
    }).catch(() => undefined);
    await prisma.referral.deleteMany({
      where: { medicalRecord: { practiceId: id } },
    }).catch(() => undefined);
    await prisma.medicalRecordAmendment.deleteMany({
      where: { medicalRecord: { practiceId: id } },
    }).catch(() => undefined);
    await prisma.appointment.deleteMany({ where: { practiceId: id } });
    await prisma.medicalRecord.deleteMany({ where: { practiceId: id } });
    await prisma.patient.deleteMany({ where: { practiceId: id } });
    await prisma.practiceSession.deleteMany({ where: { practiceId: id } }).catch(() => undefined);
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
        name: 'Block4 SA',
        passwordHash: await bcrypt.hash('TestPass123!', 10),
      },
    });
    superAdminId = sa.id;
    createdSuperAdminIds.push(sa.id);
    superAdminAuth = await issuePlatformAuth(sa.id);

    subdomain = `b4a-${Date.now().toString(36)}`;
    const practice = await prisma.practice.create({
      data: {
        subdomain,
        clinicName: `Block4 Clinic ${suffix}`,
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
    expect(practice.clinicalChartAccessMode).toBe(ClinicalChartAccessMode.ASSIGNED_DOCTOR_ONLY);

    const doctorA = await prisma.profile.create({
      data: {
        practiceId,
        email: `doctora-${suffix}@MediNathi.test`,
        fullName: 'Doctor A',
        role: UserRole.DOCTOR,
        passwordHash: await bcrypt.hash('TestPass123!', 10),
        isActive: true,
      },
    });
    doctorAProfileId = doctorA.id;
    const doctorARow = await prisma.doctor.create({
      data: { practiceId, profileId: doctorA.id, specialization: 'GP', practiceName: 'A Practice' },
    });
    doctorAId = doctorARow.id;

    const doctorB = await prisma.profile.create({
      data: {
        practiceId,
        email: `doctorb-${suffix}@MediNathi.test`,
        fullName: 'Doctor B',
        role: UserRole.DOCTOR,
        passwordHash: await bcrypt.hash('TestPass123!', 10),
        isActive: true,
      },
    });
    doctorBProfileId = doctorB.id;
    const doctorBRow = await prisma.doctor.create({
      data: { practiceId, profileId: doctorB.id, specialization: 'GP', practiceName: 'B Practice' },
    });
    doctorBId = doctorBRow.id;

    const reception = await prisma.profile.create({
      data: {
        practiceId,
        email: `reception-${suffix}@MediNathi.test`,
        fullName: 'Reception',
        role: UserRole.ADMIN,
        passwordHash: await bcrypt.hash('TestPass123!', 10),
        isActive: true,
      },
    });
    receptionProfileId = reception.id;

    const patient = await prisma.patient.create({
      data: {
        practiceId,
        firstName: 'Patient',
        lastName: 'P',
        assignedDoctorId: doctorAId,
        dateOfBirth: new Date('1990-01-01'),
      },
    });
    patientId = patient.id;

    const recordA = await prisma.medicalRecord.create({
      data: {
        practiceId,
        patientId,
        doctorId: doctorAId,
        chiefComplaint: 'Historical note by Doctor A',
        assessment: 'Tension headache',
        isDraft: false,
      },
    });
    recordAId = recordA.id;

    otherSubdomain = `b4b-${Date.now().toString(36)}`;
    const otherPractice = await prisma.practice.create({
      data: {
        subdomain: otherSubdomain,
        clinicName: `Block4 Other ${suffix}`,
        email: `other-${suffix}@MediNathi.test`,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionPlan: SubscriptionPlan.SOLO,
        doctorSeatLimit: 1,
        monthlyFeeCents: 80_000,
        brandColor: '#1E40AF',
      },
    });
    otherPracticeId = otherPractice.id;
    createdPracticeIds.push(otherPractice.id);

    const otherDoctor = await prisma.profile.create({
      data: {
        practiceId: otherPracticeId,
        email: `otherdoc-${suffix}@MediNathi.test`,
        fullName: 'Other Doctor',
        role: UserRole.DOCTOR,
        passwordHash: await bcrypt.hash('TestPass123!', 10),
        isActive: true,
      },
    });
    otherDoctorProfileId = otherDoctor.id;
    await prisma.doctor.create({
      data: {
        practiceId: otherPracticeId,
        profileId: otherDoctor.id,
        specialization: 'GP',
        practiceName: 'Other Practice',
      },
    });

    doctorAAuth = await issuePracticeAuth({ profileId: doctorAProfileId, practiceId });
    doctorBAuth = await issuePracticeAuth({ profileId: doctorBProfileId, practiceId });
    otherDoctorAuth = await issuePracticeAuth({
      profileId: otherDoctorProfileId,
      practiceId: otherPracticeId,
    });
    receptionAuth = await issuePracticeAuth({ profileId: receptionProfileId, practiceId });
  }, 60_000);

  afterAll(async () => {
    for (const id of createdPracticeIds) {
      await cleanupPractice(id);
    }
    for (const id of createdSuperAdminIds) {
      await prisma.platformSession.deleteMany({ where: { superAdminId: id } }).catch(() => undefined);
      await prisma.superAdmin.deleteMany({ where: { id } });
    }
  });

  it('1-4. default ASSIGNED denies Doctor B and allows Doctor A', async () => {
    const listA = await request(app)
      .get('/api/patients')
      .set('Cookie', doctorAAuth.cookie)
      .set('X-Tenant-Subdomain', subdomain);
    expect(listA.status).toBe(200);
    expect(listA.body.some((p: { id: string }) => p.id === patientId)).toBe(true);

    const listB = await request(app)
      .get('/api/patients')
      .set('Cookie', doctorBAuth.cookie)
      .set('X-Tenant-Subdomain', subdomain);
    expect(listB.status).toBe(200);
    expect(listB.body.some((p: { id: string }) => p.id === patientId)).toBe(false);

    const getB = await request(app)
      .get(`/api/patients/${patientId}`)
      .set('Cookie', doctorBAuth.cookie)
      .set('X-Tenant-Subdomain', subdomain);
    expect(getB.status).toBe(403);
    expect(getB.body.code).toBe('CLINICAL_CHART_ACCESS_DENIED');

    const recordB = await request(app)
      .get(`/api/medical-records/${recordAId}`)
      .set('Cookie', doctorBAuth.cookie)
      .set('X-Tenant-Subdomain', subdomain);
    expect(recordB.status).toBe(403);
  });

  it('5-10. Super Admin ALL lets Doctor B read history and create own record, not edit Doctor A', async () => {
    const switched = await request(app)
      .patch(`/api/super-admin/practices/${practiceId}/clinical-chart-access`)
      .set('Cookie', superAdminAuth.cookie)
      .set('X-CSRF-Token', superAdminAuth.csrf)
      .send({ mode: 'ALL_ACTIVE_DOCTORS' });
    expect(switched.status).toBe(200);
    expect(switched.body.clinical_chart_access_mode).toBe('ALL_ACTIVE_DOCTORS');

    const getB = await request(app)
      .get(`/api/patients/${patientId}`)
      .set('Cookie', doctorBAuth.cookie)
      .set('X-Tenant-Subdomain', subdomain);
    expect(getB.status).toBe(200);

    const list = await request(app)
      .get('/api/medical-records')
      .query({ patient_id: patientId })
      .set('Cookie', doctorBAuth.cookie)
      .set('X-Tenant-Subdomain', subdomain);
    expect(list.status).toBe(200);
    expect(list.body.some((r: { id: string }) => r.id === recordAId)).toBe(true);
    expect(list.body.find((r: { id: string }) => r.id === recordAId)?.assessment).toBe(
      'Tension headache'
    );

    const created = await request(app)
      .post('/api/medical-records')
      .set('Cookie', doctorBAuth.cookie)
      .set('X-CSRF-Token', doctorBAuth.csrf)
      .set('X-Tenant-Subdomain', subdomain)
      .send({ patient_id: patientId, chief_complaint: 'Doctor B note', is_draft: true });
    expect(created.status).toBe(201);
    expect(created.body.doctor_id).toBe(doctorBId);

    const patchA = await request(app)
      .patch(`/api/medical-records/${recordAId}`)
      .set('Cookie', doctorBAuth.cookie)
      .set('X-CSRF-Token', doctorBAuth.csrf)
      .set('X-Tenant-Subdomain', subdomain)
      .send({ assessment: 'hijacked' });
    expect(patchA.status).toBe(403);

    const audio = await request(app)
      .get(`/api/medical-records/${recordAId}/consultation-audio`)
      .set('Cookie', doctorBAuth.cookie)
      .set('X-Tenant-Subdomain', subdomain);
    expect(audio.status).toBe(403);

    const patchPatient = await request(app)
      .patch(`/api/patients/${patientId}`)
      .set('Cookie', doctorBAuth.cookie)
      .set('X-CSRF-Token', doctorBAuth.csrf)
      .set('X-Tenant-Subdomain', subdomain)
      .send({ first_name: 'Hijack' });
    expect(patchPatient.status).toBe(403);
  });

  it('11. cross-Practice Doctor is denied', async () => {
    const get = await request(app)
      .get(`/api/patients/${patientId}`)
      .set('Cookie', otherDoctorAuth.cookie)
      .set('X-Tenant-Subdomain', otherSubdomain);
    expect(get.status).toBe(404);
  });

  it('12. deactivating Doctor B denies shared access', async () => {
    await prisma.profile.update({
      where: { id: doctorBProfileId },
      data: { isActive: false },
    });
    const get = await request(app)
      .get(`/api/patients/${patientId}`)
      .set('Cookie', doctorBAuth.cookie)
      .set('X-Tenant-Subdomain', subdomain);
    expect(get.status).toBe(403);
    await prisma.profile.update({
      where: { id: doctorBProfileId },
      data: { isActive: true },
    });
  });

  it('13-14. switching back to ASSIGNED denies Doctor B immediately; Doctor A retains access', async () => {
    const switched = await request(app)
      .patch(`/api/super-admin/practices/${practiceId}/clinical-chart-access`)
      .set('Cookie', superAdminAuth.cookie)
      .set('X-CSRF-Token', superAdminAuth.csrf)
      .send({ mode: 'ASSIGNED_DOCTOR_ONLY' });
    expect(switched.status).toBe(200);

    const getB = await request(app)
      .get(`/api/patients/${patientId}`)
      .set('Cookie', doctorBAuth.cookie)
      .set('X-Tenant-Subdomain', subdomain);
    expect(getB.status).toBe(403);

    const getA = await request(app)
      .get(`/api/patients/${patientId}`)
      .set('Cookie', doctorAAuth.cookie)
      .set('X-Tenant-Subdomain', subdomain);
    expect(getA.status).toBe(200);

    const stillThere = await prisma.medicalRecord.findUnique({ where: { id: recordAId } });
    expect(stillThere).toBeTruthy();
  });

  it('15. ALL + READ_ONLY allows shared read and blocks write', async () => {
    await prisma.practice.update({
      where: { id: practiceId },
      data: {
        clinicalChartAccessMode: ClinicalChartAccessMode.ALL_ACTIVE_DOCTORS,
        subscriptionStatus: SubscriptionStatus.SUSPENDED,
        subscriptionSuspensionReason: SubscriptionSuspensionReason.BILLING_OVERDUE,
        subscriptionSuspendedAt: new Date(),
      },
    });

    const getB = await request(app)
      .get(`/api/patients/${patientId}`)
      .set('Cookie', doctorBAuth.cookie)
      .set('X-Tenant-Subdomain', subdomain);
    expect(getB.status).toBe(200);

    const create = await request(app)
      .post('/api/medical-records')
      .set('Cookie', doctorBAuth.cookie)
      .set('X-CSRF-Token', doctorBAuth.csrf)
      .set('X-Tenant-Subdomain', subdomain)
      .send({ patient_id: patientId, chief_complaint: 'blocked write' });
    expect(create.status).toBe(403);
    expect(create.body.code).toBe('PRACTICE_READ_ONLY');

    await prisma.practice.update({
      where: { id: practiceId },
      data: {
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionSuspensionReason: null,
        subscriptionSuspendedAt: null,
        clinicalChartAccessMode: ClinicalChartAccessMode.ASSIGNED_DOCTOR_ONLY,
      },
    });
  });

  it('16. telephone-created patient is assigned to the booked Doctor', async () => {
    const { createReceptionPatientWithAppointment } = await import(
      '../../services/receptionPatientService'
    );
    const appointment = await createReceptionPatientWithAppointment({
      practiceId,
      actorId: receptionProfileId,
      firstName: 'Tel',
      lastName: 'Patient',
      doctorId: doctorAId,
      scheduledAt: new Date(Date.now() + 3600_000),
      durationMinutes: 30,
    });
    const createdPatientId = appointment.patientId;
    const created = await prisma.patient.findUnique({ where: { id: createdPatientId } });
    expect(created?.assignedDoctorId).toBe(doctorAId);
  });

  it('policy-change audit is visible; shared chart access is not in platform activity', async () => {
    await request(app)
      .patch(`/api/super-admin/practices/${practiceId}/clinical-chart-access`)
      .set('Cookie', superAdminAuth.cookie)
      .set('X-CSRF-Token', superAdminAuth.csrf)
      .send({ mode: 'ALL_ACTIVE_DOCTORS' });

    const workspace = await request(app)
      .get(`/api/super-admin/practices/${practiceId}`)
      .set('Cookie', superAdminAuth.cookie);
    expect(workspace.status).toBe(200);
    expect(workspace.body.practice.clinical_chart_access_mode).toBe('ALL_ACTIVE_DOCTORS');
    const actions = (workspace.body.activity as Array<{ action: string }>).map((a) => a.action);
    expect(actions).toContain('CLINICAL_CHART_ACCESS_MODE_CHANGED');
    expect(actions).not.toContain('CLINICAL_CHART_SHARED_ACCESS');
  });

  it('tenant origin cannot mutate the platform chart-access route', async () => {
    const denied = await request(app)
      .patch(`/api/super-admin/practices/${practiceId}/clinical-chart-access`)
      .set('Cookie', superAdminAuth.cookie)
      .set('X-CSRF-Token', superAdminAuth.csrf)
      .set('Origin', `https://${subdomain}.example.test`)
      .send({ mode: 'ASSIGNED_DOCTOR_ONLY' });
    expect(denied.status).toBe(403);
  });

  it('invalid mode is rejected', async () => {
    const invalid = await request(app)
      .patch(`/api/super-admin/practices/${practiceId}/clinical-chart-access`)
      .set('Cookie', superAdminAuth.cookie)
      .set('X-CSRF-Token', superAdminAuth.csrf)
      .send({ mode: 'EVERYONE' });
    expect(invalid.status).toBe(400);
  });
});
