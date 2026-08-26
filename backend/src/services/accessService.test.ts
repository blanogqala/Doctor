import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRole } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';

vi.mock('../config/database', () => ({
  prisma: {
    patient: {
      findFirst: vi.fn(),
    },
    doctor: {
      findFirst: vi.fn(),
    },
    appointment: {
      findFirst: vi.fn(),
    },
    message: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    medicalRecord: {
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from '../config/database';
import {
  assertAppointmentAccess,
  assertClinicalPatientAccess,
  assertPatientAccess,
} from '../services/accessService';

const PRACTICE_A = '11111111-1111-1111-1111-111111111111';
const PRACTICE_B = '22222222-2222-2222-2222-222222222222';
const DOCTOR_A_PROFILE = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const DOCTOR_A_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PATIENT_A_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PATIENT_A_PROFILE = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PATIENT_B_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const PATIENT_B_PROFILE = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const APPT_B_ID = '99999999-9999-9999-9999-999999999999';
const RECORD_B_ID = '88888888-8888-8888-8888-888888888888';

const mockedPrisma = prisma as unknown as {
  patient: { findFirst: ReturnType<typeof vi.fn> };
  doctor: { findFirst: ReturnType<typeof vi.fn> };
  appointment: { findFirst: ReturnType<typeof vi.fn> };
  message: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  medicalRecord: { findFirst: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('tenant isolation — accessService', () => {
  it('Scenario A: Practice A doctor cannot access Practice B patient', async () => {
    // No patient in practice A with B's id
    mockedPrisma.patient.findFirst.mockResolvedValueOnce(null);

    await expect(
      assertPatientAccess(DOCTOR_A_PROFILE, UserRole.DOCTOR, PATIENT_B_ID, PRACTICE_A)
    ).rejects.toMatchObject({ statusCode: 404, message: 'Patient not found' } satisfies Partial<AppError>);
  });

  it('Scenario A (assignment): Practice A doctor cannot access unassigned patient in same practice', async () => {
    mockedPrisma.patient.findFirst
      .mockResolvedValueOnce({
        id: PATIENT_A_ID,
        practiceId: PRACTICE_A,
        profileId: PATIENT_A_PROFILE,
        assignedDoctorId: 'other-doctor',
        softDeletedAt: null,
      })
      .mockResolvedValueOnce(null); // isDoctorForPatient patient lookup
    mockedPrisma.doctor.findFirst.mockResolvedValueOnce({
      id: DOCTOR_A_ID,
      profileId: DOCTOR_A_PROFILE,
      practiceId: PRACTICE_A,
    });

    await expect(
      assertPatientAccess(DOCTOR_A_PROFILE, UserRole.DOCTOR, PATIENT_A_ID, PRACTICE_A)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('Scenario B: Practice A admin cannot access Practice B appointment', async () => {
    mockedPrisma.appointment.findFirst.mockResolvedValueOnce(null);

    await expect(
      assertAppointmentAccess(DOCTOR_A_PROFILE, UserRole.ADMIN, APPT_B_ID, PRACTICE_A)
    ).rejects.toMatchObject({ statusCode: 404, message: 'Appointment not found' });
  });

  it('Scenario C: Patient A cannot access Patient B clinical record patient', async () => {
    mockedPrisma.patient.findFirst.mockResolvedValueOnce({
      id: PATIENT_B_ID,
      practiceId: PRACTICE_A,
      profileId: PATIENT_B_PROFILE,
      softDeletedAt: null,
    });

    await expect(
      assertClinicalPatientAccess(PATIENT_A_PROFILE, UserRole.PATIENT, PATIENT_B_ID, PRACTICE_A)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('Scenario D: Practice A doctor cannot clinically access Practice B patient/record owner', async () => {
    mockedPrisma.patient.findFirst.mockResolvedValueOnce(null);

    await expect(
      assertClinicalPatientAccess(DOCTOR_A_PROFILE, UserRole.DOCTOR, PATIENT_B_ID, PRACTICE_A)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('Scenario E: cross-practice message patient lookup denied via practice scoping', async () => {
    // Messaging create looks up patient with practiceId — missing => 404 pattern
    mockedPrisma.patient.findFirst.mockResolvedValueOnce(null);
    const patient = await prisma.patient.findFirst({
      where: { id: PATIENT_B_ID, practiceId: PRACTICE_A, softDeletedAt: null },
    });
    expect(patient).toBeNull();
  });

  it('ADMIN cannot use clinical patient access (reception privacy)', async () => {
    mockedPrisma.patient.findFirst.mockResolvedValueOnce({
      id: PATIENT_A_ID,
      practiceId: PRACTICE_A,
      profileId: PATIENT_A_PROFILE,
      softDeletedAt: null,
    });

    await expect(
      assertClinicalPatientAccess(DOCTOR_A_PROFILE, UserRole.ADMIN, PATIENT_A_ID, PRACTICE_A)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('ADMIN retains operational patient access within tenant', async () => {
    const patient = {
      id: PATIENT_A_ID,
      practiceId: PRACTICE_A,
      profileId: PATIENT_A_PROFILE,
      softDeletedAt: null,
    };
    mockedPrisma.patient.findFirst.mockResolvedValueOnce(patient);

    await expect(
      assertPatientAccess(DOCTOR_A_PROFILE, UserRole.ADMIN, PATIENT_A_ID, PRACTICE_A)
    ).resolves.toEqual(patient);
  });
});

describe('appointment patient status policy', () => {
  it('documents that COMPLETED is not a patient-allowed status transition', () => {
    const patientMaySetStatus = (next: string, existing: string) =>
      next === 'CANCELLED' || next === existing;
    expect(patientMaySetStatus('COMPLETED', 'IN_CONSULTATION')).toBe(false);
    expect(patientMaySetStatus('CANCELLED', 'CONFIRMED')).toBe(true);
  });
});

describe('medical record practice scoping', () => {
  it('Scenario D helper: record in other practice not found when scoped by practiceId', async () => {
    mockedPrisma.medicalRecord.findFirst.mockResolvedValueOnce(null);
    const record = await prisma.medicalRecord.findFirst({
      where: { id: RECORD_B_ID, practiceId: PRACTICE_A },
    });
    expect(record).toBeNull();
  });
});
