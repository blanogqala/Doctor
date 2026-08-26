/**
 * Phase 8 Block 6 — adversarial tenant / role / record / storage / session matrix.
 * Requires RUN_INTEGRATION=1 and reachable non-production PostgreSQL.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  AppointmentStatus,
  AppointmentType,
  SubscriptionPlan,
  SubscriptionStatus,
  UserRole,
} from '@prisma/client';
import { app } from '../../server';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { assertNonProductionDatabaseUrl } from '../assertNonProductionDb';
import { issuePlatformAuth, issuePracticeAuth } from '../sessionAuth';
import { hashToken } from '../../utils/secureToken';
import {
  createClinicalStorage,
  resetClinicalStorageForTests,
} from '../../services/clinicalStorage';
import { buildClinicalObjectKey } from '../../services/clinicalStorage/types';

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

describe.skipIf(!RUN)('Block 6 adversarial security (RUN_INTEGRATION=1)', () => {
  const suffix = `b6-${Date.now().toString(36)}`;
  let storageRoot = '';
  let practiceAId = '';
  let practiceBId = '';
  let subdomainA = '';
  let subdomainB = '';
  let doctorAProfileId = '';
  let doctorARowId = '';
  let doctorBProfileId = '';
  let doctorBRowId = '';
  let patientAProfileId = '';
  let patientAId = '';
  let patientBProfileId = '';
  let patientBId = '';
  let receptionAProfileId = '';
  let ownerAProfileId = '';
  let superAdminId = '';
  let recordAId = '';
  let draftRecordAId = '';
  let finalizedRecordAId = '';
  let audioKey = '';
  let apptAId = '';
  let teleApptAId = '';
  let messageAId = '';
  let createdPracticeIds: string[] = [];
  let createdSuperAdminIds: string[] = [];

  beforeAll(async () => {
    await assertDb();

    storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'medspace-b6-'));
    resetClinicalStorageForTests(createClinicalStorage({ driver: 'local', root: storageRoot }));

    const sa = await prisma.superAdmin.create({
      data: {
        email: `sa-${suffix}@medspace.test`,
        name: 'Block6 SA',
        passwordHash: await bcrypt.hash('TestPass123!', 10),
      },
    });
    superAdminId = sa.id;
    createdSuperAdminIds.push(sa.id);

    subdomainA = `b6a-${Date.now().toString(36)}`;
    subdomainB = `b6b-${Date.now().toString(36)}`;

    const practiceA = await prisma.practice.create({
      data: {
        subdomain: subdomainA,
        clinicName: `Block6 A ${suffix}`,
        email: `clinic-a-${suffix}@medspace.test`,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionPlan: SubscriptionPlan.CLINIC,
        doctorSeatLimit: 5,
        monthlyFeeCents: 350_000,
        brandColor: '#1E40AF',
      },
    });
    practiceAId = practiceA.id;
    createdPracticeIds.push(practiceA.id);

    const practiceB = await prisma.practice.create({
      data: {
        subdomain: subdomainB,
        clinicName: `Block6 B ${suffix}`,
        email: `clinic-b-${suffix}@medspace.test`,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionPlan: SubscriptionPlan.CLINIC,
        doctorSeatLimit: 5,
        monthlyFeeCents: 350_000,
        brandColor: '#1E40AF',
      },
    });
    practiceBId = practiceB.id;
    createdPracticeIds.push(practiceB.id);

    async function seedPractice(practiceId: string, label: 'A' | 'B') {
      const owner = await prisma.profile.create({
        data: {
          practiceId,
          email: `owner-${label}-${suffix}@medspace.test`,
          fullName: `Owner ${label}`,
          role: UserRole.DOCTOR,
          passwordHash: await bcrypt.hash('TestPass123!', 10),
          isActive: true,
        },
      });
      await prisma.practice.update({
        where: { id: practiceId },
        data: { ownerProfileId: owner.id },
      });
      const doctorRow = await prisma.doctor.create({
        data: {
          practiceId,
          profileId: owner.id,
          specialization: 'GP',
          practiceName: `Block6 ${label}`,
        },
      });

      const reception = await prisma.profile.create({
        data: {
          practiceId,
          email: `reception-${label}-${suffix}@medspace.test`,
          fullName: `Reception ${label}`,
          role: UserRole.ADMIN,
          passwordHash: await bcrypt.hash('TestPass123!', 10),
          isActive: true,
        },
      });

      const patientProfile = await prisma.profile.create({
        data: {
          practiceId,
          email: `patient-${label}-${suffix}@medspace.test`,
          fullName: `Patient ${label}`,
          role: UserRole.PATIENT,
          passwordHash: await bcrypt.hash('TestPass123!', 10),
          isActive: true,
          activatedAt: new Date(),
        },
      });
      const patient = await prisma.patient.create({
        data: {
          practiceId,
          profileId: patientProfile.id,
          idNumber: `B6${label}${Date.now().toString().slice(-8)}`,
          dateOfBirth: new Date('1990-01-01'),
          gender: 'UNKNOWN',
          assignedDoctorId: doctorRow.id,
        },
      });

      return {
        ownerId: owner.id,
        doctorRowId: doctorRow.id,
        receptionId: reception.id,
        patientProfileId: patientProfile.id,
        patientId: patient.id,
      };
    }

    const a = await seedPractice(practiceAId, 'A');
    const b = await seedPractice(practiceBId, 'B');
    ownerAProfileId = a.ownerId;
    doctorAProfileId = a.ownerId;
    doctorARowId = a.doctorRowId;
    receptionAProfileId = a.receptionId;
    patientAProfileId = a.patientProfileId;
    patientAId = a.patientId;
    doctorBProfileId = b.ownerId;
    doctorBRowId = b.doctorRowId;
    patientBProfileId = b.patientProfileId;
    patientBId = b.patientId;

    const draft = await prisma.medicalRecord.create({
      data: {
        practiceId: practiceAId,
        patientId: patientAId,
        doctorId: doctorARowId,
        isDraft: true,
        chiefComplaint: 'B6 draft complaint',
        primaryDiagnosis: 'B6 draft dx',
      },
    });
    draftRecordAId = draft.id;
    recordAId = draft.id;

    const finalized = await prisma.medicalRecord.create({
      data: {
        practiceId: practiceAId,
        patientId: patientAId,
        doctorId: doctorARowId,
        isDraft: false,
        chiefComplaint: 'B6 final complaint',
        primaryDiagnosis: 'B6 final dx',
        scribeTranscript: 'B6 secret transcript',
      },
    });
    finalizedRecordAId = finalized.id;

    audioKey = buildClinicalObjectKey({
      practiceId: practiceAId,
      recordId: finalizedRecordAId,
      extension: 'webm',
    });
    const storage = createClinicalStorage({ driver: 'local', root: storageRoot });
    await storage.put(audioKey, Buffer.from('RIFF....WEBMFAKE'));
    await prisma.medicalRecord.update({
      where: { id: finalizedRecordAId },
      data: {
        scribeAudioPath: audioKey,
        scribeAudioMimeType: 'audio/webm',
      },
    });

    const appt = await prisma.appointment.create({
      data: {
        practiceId: practiceAId,
        patientId: patientAId,
        doctorId: doctorARowId,
        scheduledAt: new Date(Date.now() + 60 * 60_000),
        durationMinutes: 30,
        type: AppointmentType.IN_PERSON,
        status: AppointmentStatus.SCHEDULED,
        reason: 'B6 fixture appointment',
      },
    });
    apptAId = appt.id;

    const tele = await prisma.appointment.create({
      data: {
        practiceId: practiceAId,
        patientId: patientAId,
        doctorId: doctorARowId,
        scheduledAt: new Date(Date.now() + 5 * 60_000),
        durationMinutes: 30,
        type: AppointmentType.TELEMEDICINE,
        status: AppointmentStatus.CONFIRMED_TELEMEDICINE,
        patientTelemedicineDecision: 'ACCEPTED_VIDEO',
      },
    });
    teleApptAId = tele.id;

    await prisma.telemedicineConsent.create({
      data: {
        practiceId: practiceAId,
        patientId: patientAId,
        consentGiven: true,
        consentTextHash: 'b6-tele-consent',
      },
    });

    const msg = await prisma.message.create({
      data: {
        practiceId: practiceAId,
        senderId: doctorAProfileId,
        recipientId: patientAProfileId,
        patientId: patientAId,
        body: 'B6 private message content',
      },
    });
    messageAId = msg.id;
  });

  afterAll(async () => {
    resetClinicalStorageForTests();
    if (storageRoot) fs.rmSync(storageRoot, { recursive: true, force: true });
    try {
      if (finalizedRecordAId) {
        await prisma.medicalRecordAmendment.deleteMany({
          where: { medicalRecordId: finalizedRecordAId },
        });
      }
      if (createdPracticeIds.length) {
        await prisma.practice.deleteMany({ where: { id: { in: createdPracticeIds } } });
      }
      if (createdSuperAdminIds.length) {
        await prisma.superAdmin.deleteMany({ where: { id: { in: createdSuperAdminIds } } });
      }
    } catch (err) {
      console.warn('[block6] cleanup warning:', err instanceof Error ? err.message : err);
    }
  });

  describe('tenant matrix Practice A vs B', () => {
    it('Doctor B cannot read Practice A medical record', async () => {
      const auth = await issuePracticeAuth({
        profileId: doctorBProfileId,
        practiceId: practiceBId,
      });
      const res = await request(app)
        .get(`/api/medical-records/${finalizedRecordAId}`)
        .set('Cookie', auth.cookie)
        .set('X-Tenant-Subdomain', subdomainB);
      expect([403, 404]).toContain(res.status);
    });

    it('Doctor B cannot stream Practice A consultation audio', async () => {
      const auth = await issuePracticeAuth({
        profileId: doctorBProfileId,
        practiceId: practiceBId,
      });
      const res = await request(app)
        .get(`/api/medical-records/${finalizedRecordAId}/consultation-audio`)
        .set('Cookie', auth.cookie)
        .set('X-Tenant-Subdomain', subdomainB);
      expect([403, 404]).toContain(res.status);
    });

    it('Doctor B cannot read Practice A patient', async () => {
      const auth = await issuePracticeAuth({
        profileId: doctorBProfileId,
        practiceId: practiceBId,
      });
      const res = await request(app)
        .get(`/api/patients/${patientAId}`)
        .set('Cookie', auth.cookie)
        .set('X-Tenant-Subdomain', subdomainB);
      expect([403, 404]).toContain(res.status);
    });

    it('Doctor B cannot read Practice A appointment', async () => {
      const auth = await issuePracticeAuth({
        profileId: doctorBProfileId,
        practiceId: practiceBId,
      });
      const res = await request(app)
        .get(`/api/appointments/${apptAId}`)
        .set('Cookie', auth.cookie)
        .set('X-Tenant-Subdomain', subdomainB);
      expect([403, 404]).toContain(res.status);
    });

    it('Doctor B cannot list Practice A messages (tenant isolation)', async () => {
      const auth = await issuePracticeAuth({
        profileId: doctorBProfileId,
        practiceId: practiceBId,
      });
      const res = await request(app)
        .get('/api/messages')
        .set('Cookie', auth.cookie)
        .set('X-Tenant-Subdomain', subdomainB);
      expect(res.status).toBe(200);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain('B6 private message content');
      expect(body).not.toContain(messageAId);
    });

    it('Doctor A with Practice B tenant header is denied (session practice mismatch)', async () => {
      const auth = await issuePracticeAuth({
        profileId: doctorAProfileId,
        practiceId: practiceAId,
      });
      const res = await request(app)
        .get(`/api/medical-records/${finalizedRecordAId}`)
        .set('Cookie', auth.cookie)
        .set('X-Tenant-Subdomain', subdomainB);
      expect(res.status).toBe(403);
      expect(res.body.code).toMatch(/PRACTICE_MISMATCH|FORBIDDEN/i);
    });

    it('Doctor B cannot obtain Practice A telemedicine join token', async () => {
      const auth = await issuePracticeAuth({
        profileId: doctorBProfileId,
        practiceId: practiceBId,
      });
      const res = await request(app)
        .post(`/api/appointments/${teleApptAId}/telemedicine/join`)
        .set('Cookie', auth.cookie)
        .set('X-CSRF-Token', auth.csrf)
        .set('X-Tenant-Subdomain', subdomainB);
      expect([403, 404]).toContain(res.status);
    });

    it('Owner B cannot access Practice A practice-management', async () => {
      const auth = await issuePracticeAuth({
        profileId: doctorBProfileId,
        practiceId: practiceBId,
      });
      const res = await request(app)
        .get('/api/practice-management')
        .set('Cookie', auth.cookie)
        .set('X-Tenant-Subdomain', subdomainA);
      expect(res.status).toBe(403);
    });
  });

  describe('role matrix', () => {
    it('Reception cannot stream consultation audio', async () => {
      const auth = await issuePracticeAuth({
        profileId: receptionAProfileId,
        practiceId: practiceAId,
      });
      const res = await request(app)
        .get(`/api/medical-records/${finalizedRecordAId}/consultation-audio`)
        .set('Cookie', auth.cookie)
        .set('X-Tenant-Subdomain', subdomainA);
      expect(res.status).toBe(403);
    });

    it('Reception medical record payload omits clinical SOAP fields', async () => {
      const auth = await issuePracticeAuth({
        profileId: receptionAProfileId,
        practiceId: practiceAId,
      });
      const res = await request(app)
        .get(`/api/medical-records/${finalizedRecordAId}`)
        .set('Cookie', auth.cookie)
        .set('X-Tenant-Subdomain', subdomainA);
      expect([200, 403]).toContain(res.status);
      if (res.status === 200) {
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/B6 final dx|B6 secret transcript|primaryDiagnosis|scribeTranscript/i);
      }
    });

    it('Patient cannot read another practice patient record id', async () => {
      const auth = await issuePracticeAuth({
        profileId: patientAProfileId,
        practiceId: practiceAId,
      });
      // Patient B id under wrong tenant context should fail
      const res = await request(app)
        .get(`/api/patients/${patientBId}`)
        .set('Cookie', auth.cookie)
        .set('X-Tenant-Subdomain', subdomainA);
      expect([403, 404]).toContain(res.status);
    });

    it('Super Admin cannot read clinical medical records', async () => {
      const auth = await issuePlatformAuth(superAdminId);
      const res = await request(app)
        .get(`/api/medical-records/${finalizedRecordAId}`)
        .set('Cookie', auth.cookie)
        .set('X-Tenant-Subdomain', subdomainA);
      expect([401, 403, 404]).toContain(res.status);
    });

    it('Reception cannot join telemedicine', async () => {
      const auth = await issuePracticeAuth({
        profileId: receptionAProfileId,
        practiceId: practiceAId,
      });
      const res = await request(app)
        .post(`/api/appointments/${teleApptAId}/telemedicine/join`)
        .set('Cookie', auth.cookie)
        .set('X-CSRF-Token', auth.csrf)
        .set('X-Tenant-Subdomain', subdomainA);
      expect(res.status).toBe(403);
    });
  });

  describe('medical record integrity', () => {
    it('draft remains editable by authoring doctor', async () => {
      const auth = await issuePracticeAuth({
        profileId: doctorAProfileId,
        practiceId: practiceAId,
      });
      const res = await request(app)
        .patch(`/api/medical-records/${draftRecordAId}`)
        .set('Cookie', auth.cookie)
        .set('X-CSRF-Token', auth.csrf)
        .set('X-Tenant-Subdomain', subdomainA)
        .send({ chief_complaint: 'B6 draft updated', autosave: true });
      expect(res.status).toBe(200);
    });

    it('finalized record rejects clinical PATCH', async () => {
      const auth = await issuePracticeAuth({
        profileId: doctorAProfileId,
        practiceId: practiceAId,
      });
      const res = await request(app)
        .patch(`/api/medical-records/${finalizedRecordAId}`)
        .set('Cookie', auth.cookie)
        .set('X-CSRF-Token', auth.csrf)
        .set('X-Tenant-Subdomain', subdomainA)
        .send({ chief_complaint: 'should not stick', autosave: true });
      expect([400, 409]).toContain(res.status);
    });

    it('autosave cannot finalize', async () => {
      const auth = await issuePracticeAuth({
        profileId: doctorAProfileId,
        practiceId: practiceAId,
      });
      const res = await request(app)
        .patch(`/api/medical-records/${draftRecordAId}`)
        .set('Cookie', auth.cookie)
        .set('X-CSRF-Token', auth.csrf)
        .set('X-Tenant-Subdomain', subdomainA)
        .send({ is_draft: false, autosave: true });
      expect(res.status).toBe(400);
    });

    it('amendment is append-only on finalized record', async () => {
      const auth = await issuePracticeAuth({
        profileId: doctorAProfileId,
        practiceId: practiceAId,
      });
      const res = await request(app)
        .post(`/api/medical-records/${finalizedRecordAId}/amendments`)
        .set('Cookie', auth.cookie)
        .set('X-CSRF-Token', auth.csrf)
        .set('X-Tenant-Subdomain', subdomainA)
        .send({ correction_note: 'B6 amendment note' });
      expect(res.status).toBe(201);
      const count = await prisma.medicalRecordAmendment.count({
        where: { medicalRecordId: finalizedRecordAId },
      });
      expect(count).toBeGreaterThanOrEqual(1);
      const stillFinal = await prisma.medicalRecord.findUnique({
        where: { id: finalizedRecordAId },
      });
      expect(stillFinal?.isDraft).toBe(false);
      expect(stillFinal?.primaryDiagnosis).toBe('B6 final dx');
    });
  });

  describe('storage security', () => {
    it('unauthenticated audio stream is denied', async () => {
      const res = await request(app)
        .get(`/api/medical-records/${finalizedRecordAId}/consultation-audio`)
        .set('X-Tenant-Subdomain', subdomainA);
      expect(res.status).toBe(401);
    });

    it('Patient cannot stream consultation audio', async () => {
      const auth = await issuePracticeAuth({
        profileId: patientAProfileId,
        practiceId: practiceAId,
      });
      const res = await request(app)
        .get(`/api/medical-records/${finalizedRecordAId}/consultation-audio`)
        .set('Cookie', auth.cookie)
        .set('X-Tenant-Subdomain', subdomainA);
      expect(res.status).toBe(403);
    });

    it('authoring Doctor can stream consultation audio', async () => {
      const auth = await issuePracticeAuth({
        profileId: doctorAProfileId,
        practiceId: practiceAId,
      });
      const res = await request(app)
        .get(`/api/medical-records/${finalizedRecordAId}/consultation-audio`)
        .set('Cookie', auth.cookie)
        .set('X-Tenant-Subdomain', subdomainA);
      expect(res.status).toBe(200);
    });

    it('path traversal keys are rejected by storage helper', async () => {
      const { FilesystemClinicalStorage } = await import(
        '../../services/clinicalStorage/filesystemStorage'
      );
      const storage = new FilesystemClinicalStorage('local', storageRoot);
      expect(() => storage.absolutePath('../etc/passwd')).toThrow();
      await expect(storage.openReadStream('../etc/passwd')).rejects.toThrow();
    });
  });

  describe('session attacks', () => {
    it('expired practice session is rejected', async () => {
      const auth = await issuePracticeAuth({
        profileId: doctorAProfileId,
        practiceId: practiceAId,
      });
      await prisma.practiceSession.updateMany({
        where: { tokenHash: hashToken(auth.rawToken) },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', auth.cookie)
        .set('X-Tenant-Subdomain', subdomainA);
      expect(res.status).toBe(401);
    });

    it('disabled user cannot use practice session', async () => {
      const disabled = await prisma.profile.create({
        data: {
          practiceId: practiceAId,
          email: `disabled-${suffix}@medspace.test`,
          fullName: 'Disabled Doc',
          role: UserRole.DOCTOR,
          passwordHash: await bcrypt.hash('TestPass123!', 10),
          isActive: false,
        },
      });
      const auth = await issuePracticeAuth({
        profileId: disabled.id,
        practiceId: practiceAId,
      });
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', auth.cookie)
        .set('X-Tenant-Subdomain', subdomainA);
      expect([401, 403]).toContain(res.status);
    });

    it('CSRF missing on mutation is rejected', async () => {
      const auth = await issuePracticeAuth({
        profileId: doctorAProfileId,
        practiceId: practiceAId,
      });
      const res = await request(app)
        .patch(`/api/medical-records/${draftRecordAId}`)
        .set('Cookie', auth.cookie)
        .set('X-Tenant-Subdomain', subdomainA)
        .send({ chief_complaint: 'csrf missing', autosave: true });
      expect(res.status).toBe(403);
    });

    it('platform session cannot access clinical API', async () => {
      const auth = await issuePlatformAuth(superAdminId);
      const res = await request(app)
        .get(`/api/patients/${patientAId}`)
        .set('Cookie', auth.cookie)
        .set('X-Tenant-Subdomain', subdomainA);
      expect([401, 403]).toContain(res.status);
    });
  });
});
