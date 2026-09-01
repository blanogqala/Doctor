/**
 * Consultation AI recording persistence — requires RUN_INTEGRATION=1 and DB.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  RecordingConsentMode,
  SubscriptionPlan,
  SubscriptionStatus,
  UserRole,
} from '@prisma/client';
import { app } from '../../server';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { assertNonProductionDatabaseUrl } from '../assertNonProductionDb';
import { authHeaders, issuePracticeAuth } from '../sessionAuth';
import {
  createClinicalStorage,
  resetClinicalStorageForTests,
} from '../../services/clinicalStorage';

const RUN = Boolean(process.env.RUN_INTEGRATION);

function minimalWebmBuffer(): Buffer {
  return Buffer.from([
    0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
}

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

describe.skipIf(!RUN)('scribe recording integration (RUN_INTEGRATION=1)', () => {
  const suffix = `scribe-${Date.now().toString(36)}`;
  let storageRoot = '';
  let practiceId = '';
  let subdomain = '';
  let doctorProfileId = '';
  let doctorRowId = '';
  let patientId = '';
  let draftRecordId = '';
  let consentId = '';
  let createdPracticeIds: string[] = [];

  beforeAll(async () => {
    await assertDb();

    storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'MediNathi-scribe-'));
    resetClinicalStorageForTests(createClinicalStorage({ driver: 'local', root: storageRoot }));

    subdomain = `scribe-${Date.now().toString(36)}`;
    const practice = await prisma.practice.create({
      data: {
        subdomain,
        clinicName: `Scribe IT ${suffix}`,
        email: `scribe-clinic-${suffix}@MediNathi.test`,
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
        email: `doctor-${suffix}@MediNathi.test`,
        fullName: 'Scribe IT Doctor',
        role: UserRole.DOCTOR,
        passwordHash: await bcrypt.hash('TestPass123!', 10),
        isActive: true,
      },
    });
    doctorProfileId = doctorProfile.id;

    const doctorRow = await prisma.doctor.create({
      data: {
        practiceId,
        profileId: doctorProfile.id,
        specialization: 'GP',
        practiceName: 'Scribe IT Clinic',
      },
    });
    doctorRowId = doctorRow.id;

    await prisma.practice.update({
      where: { id: practiceId },
      data: { ownerProfileId: doctorProfile.id },
    });

    const patientProfile = await prisma.profile.create({
      data: {
        practiceId,
        email: `patient-${suffix}@MediNathi.test`,
        fullName: 'Scribe IT Patient',
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
          firstName: 'Scribe',
          lastName: 'Patient',
          idNumber: `SCR${Date.now().toString().slice(-8)}`,
        dateOfBirth: new Date('1990-01-01'),
        gender: 'UNKNOWN',
        assignedDoctorId: doctorRow.id,
      },
    });
    patientId = patient.id;

    const draft = await prisma.medicalRecord.create({
      data: {
        practiceId,
        patientId,
        doctorId: doctorRowId,
        isDraft: true,
        chiefComplaint: 'Scribe integration draft',
      },
    });
    draftRecordId = draft.id;

    const consent = await prisma.consultationRecordingConsent.create({
      data: {
        practiceId,
        patientId,
        doctorId: doctorRowId,
        medicalRecordId: draftRecordId,
        consentMode: RecordingConsentMode.CONSULTATION,
      },
    });
    consentId = consent.id;
  });

  afterAll(async () => {
    try {
      if (createdPracticeIds.length) {
        await prisma.practice.deleteMany({ where: { id: { in: createdPracticeIds } } });
      }
    } catch (err) {
      console.warn('[scribe-recording] cleanup warning:', err instanceof Error ? err.message : err);
    }
    resetClinicalStorageForTests();
  });

  it('uploads recording on draft, finalizes, and exposes scribe fields to doctor', async () => {
    const auth = await issuePracticeAuth({
      profileId: doctorProfileId,
      practiceId,
    });
    const headers = authHeaders(auth, { 'X-Tenant-Subdomain': subdomain });

    const uploadRes = await request(app)
      .post(`/api/medical-records/${draftRecordId}/consultation-recording`)
      .set(headers)
      .field('consentId', consentId)
      .field('transcript', 'Patient reports headache for three days.')
      .attach('audio', minimalWebmBuffer(), {
        filename: 'consultation.webm',
        contentType: 'audio/webm',
      });

    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.has_scribe_recording).toBe(true);
    expect(uploadRes.body.scribe_transcript).toContain('headache');

    const finalizeRes = await request(app)
      .patch(`/api/medical-records/${draftRecordId}`)
      .set(headers)
      .send({
        is_draft: false,
        chief_complaint: 'Headache',
        primary_diagnosis: 'Tension headache',
      });

    expect(finalizeRes.status).toBe(200);
    expect(finalizeRes.body.is_draft).toBe(false);

    const getRes = await request(app)
      .get(`/api/medical-records/${draftRecordId}`)
      .set('Cookie', auth.cookie)
      .set('X-Tenant-Subdomain', subdomain);

    expect(getRes.status).toBe(200);
    expect(getRes.body.has_scribe_recording).toBe(true);
    expect(getRes.body.scribe_transcript).toContain('headache');
  });

  it('rejects recording upload on finalized records', async () => {
    const auth = await issuePracticeAuth({
      profileId: doctorProfileId,
      practiceId,
    });
    const headers = authHeaders(auth, { 'X-Tenant-Subdomain': subdomain });

    const consent = await prisma.consultationRecordingConsent.create({
      data: {
        practiceId,
        patientId,
        doctorId: doctorRowId,
        medicalRecordId: draftRecordId,
        consentMode: RecordingConsentMode.CONSULTATION,
      },
    });

    const res = await request(app)
      .post(`/api/medical-records/${draftRecordId}/consultation-recording`)
      .set(headers)
      .field('consentId', consent.id)
      .field('transcript', 'Should not attach after finalize.')
      .attach('audio', minimalWebmBuffer(), {
        filename: 'consultation.webm',
        contentType: 'audio/webm',
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/finalized medical record/i);
  });
});
