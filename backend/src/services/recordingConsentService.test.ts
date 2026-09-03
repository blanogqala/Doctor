import { describe, expect, it, vi } from 'vitest';
import { RecordingConsentMode } from '@prisma/client';

vi.mock('../config/database', () => ({
  prisma: {
    consultationRecordingConsent: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    medicalRecord: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('./accessService', () => ({
  assertClinicalPatientAccess: vi.fn(),
  assertAppointmentAccess: vi.fn(),
  getDoctorIdForProfile: vi.fn(),
}));

vi.mock('./auditService', () => ({
  logAudit: vi.fn(),
}));

import { prisma } from '../config/database';
import {
  assertAppointmentAccess,
  assertClinicalPatientAccess,
  getDoctorIdForProfile,
} from './accessService';
import {
  createRecordingConsent,
  requireValidRecordingConsent,
} from './recordingConsentService';

describe('recordingConsentService', () => {
  it('rejects consent when expected mode mismatches', async () => {
    vi.mocked(prisma.consultationRecordingConsent.findFirst).mockResolvedValue({
      id: 'c1',
      practiceId: 'p1',
      patientId: 'pat1',
      doctorId: 'doc1',
      medicalRecordId: null,
      appointmentId: null,
      consentMode: RecordingConsentMode.CONSULTATION,
      consentTextHash: null,
      ipAddress: null,
      userAgent: null,
      consentedAt: new Date(),
      revokedAt: null,
    } as never);

    await expect(
      requireValidRecordingConsent({
        consentId: 'c1',
        practiceId: 'p1',
        doctorId: 'doc1',
        patientId: 'pat1',
        expectedMode: RecordingConsentMode.DICTATION,
      })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('validates appointment belongs to patient on create', async () => {
    vi.mocked(assertClinicalPatientAccess).mockResolvedValue(undefined as never);
    vi.mocked(getDoctorIdForProfile).mockResolvedValue('doc1');
    vi.mocked(assertAppointmentAccess).mockResolvedValue({
      id: 'appt1',
      patientId: 'other-patient',
      doctorId: 'doc1',
    } as never);

    await expect(
      createRecordingConsent({
        practiceId: 'p1',
        actorUserId: 'user1',
        role: 'DOCTOR',
        patientId: 'pat1',
        appointmentId: 'appt1',
        consentMode: RecordingConsentMode.CONSULTATION,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
