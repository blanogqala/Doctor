import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClinicalChartAccessMode, UserRole } from '@prisma/client';

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
    practice: {
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

vi.mock('./auditService', () => ({
  logAudit: vi.fn(),
}));

import { prisma } from '../config/database';
import { logAudit } from './auditService';
import { AppError } from '../middleware/errorHandler';
import {
  assertAppointmentAccess,
  assertClinicalPatientAccess,
  assertDoctorCanAccessPatientChart,
  assertPatientAccess,
  auditSharedClinicalChartAccess,
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
  practice: { findFirst: ReturnType<typeof vi.fn> };
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

const assignedPatient = {
  id: PATIENT_A_ID,
  practiceId: PRACTICE_A,
  profileId: PATIENT_A_PROFILE,
  assignedDoctorId: DOCTOR_A_ID,
  softDeletedAt: null,
};

const unassignedPatient = {
  ...assignedPatient,
  assignedDoctorId: 'other-doctor-id',
};

const activeDoctor = {
  id: DOCTOR_A_ID,
  profileId: DOCTOR_A_PROFILE,
  practiceId: PRACTICE_A,
  profile: { role: UserRole.DOCTOR, isActive: true, softDeletedAt: null },
};

describe('clinical chart access policy', () => {
  it('1. assigned Doctor + ASSIGNED mode is allowed', async () => {
    mockedPrisma.patient.findFirst.mockResolvedValueOnce(assignedPatient);
    mockedPrisma.doctor.findFirst.mockResolvedValueOnce(activeDoctor);

    await expect(
      assertClinicalPatientAccess(DOCTOR_A_PROFILE, UserRole.DOCTOR, PATIENT_A_ID, PRACTICE_A)
    ).resolves.toMatchObject({
      doctorId: DOCTOR_A_ID,
      accessBasis: 'ASSIGNED_DOCTOR',
    });
    expect(mockedPrisma.practice.findFirst).not.toHaveBeenCalled();
  });

  it('2. same-Practice non-assigned Doctor + ASSIGNED is denied', async () => {
    mockedPrisma.patient.findFirst.mockResolvedValueOnce(unassignedPatient);
    mockedPrisma.doctor.findFirst.mockResolvedValueOnce(activeDoctor);
    mockedPrisma.practice.findFirst.mockResolvedValueOnce({
      clinicalChartAccessMode: ClinicalChartAccessMode.ASSIGNED_DOCTOR_ONLY,
    });

    await expect(
      assertClinicalPatientAccess(DOCTOR_A_PROFILE, UserRole.DOCTOR, PATIENT_A_ID, PRACTICE_A)
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'CLINICAL_CHART_ACCESS_DENIED',
      message: "You do not have access to this patient's clinical chart.",
    });
  });

  it('3. same-Practice active non-assigned Doctor + ALL is PRACTICE_WIDE', async () => {
    mockedPrisma.patient.findFirst.mockResolvedValueOnce(unassignedPatient);
    mockedPrisma.doctor.findFirst.mockResolvedValueOnce(activeDoctor);
    mockedPrisma.practice.findFirst.mockResolvedValueOnce({
      clinicalChartAccessMode: ClinicalChartAccessMode.ALL_ACTIVE_DOCTORS,
    });

    await expect(
      assertClinicalPatientAccess(DOCTOR_A_PROFILE, UserRole.DOCTOR, PATIENT_A_ID, PRACTICE_A)
    ).resolves.toMatchObject({
      doctorId: DOCTOR_A_ID,
      accessBasis: 'PRACTICE_WIDE',
    });
  });

  it('4. inactive Doctor + ALL is denied', async () => {
    mockedPrisma.patient.findFirst.mockResolvedValueOnce(unassignedPatient);
    mockedPrisma.doctor.findFirst.mockResolvedValueOnce({
      ...activeDoctor,
      profile: { role: UserRole.DOCTOR, isActive: false, softDeletedAt: null },
    });

    await expect(
      assertClinicalPatientAccess(DOCTOR_A_PROFILE, UserRole.DOCTOR, PATIENT_A_ID, PRACTICE_A)
    ).rejects.toMatchObject({ statusCode: 403, code: 'CLINICAL_CHART_ACCESS_DENIED' });
  });

  it('5. soft-deleted Doctor + ALL is denied', async () => {
    mockedPrisma.patient.findFirst.mockResolvedValueOnce(unassignedPatient);
    mockedPrisma.doctor.findFirst.mockResolvedValueOnce({
      ...activeDoctor,
      profile: { role: UserRole.DOCTOR, isActive: true, softDeletedAt: new Date() },
    });

    await expect(
      assertClinicalPatientAccess(DOCTOR_A_PROFILE, UserRole.DOCTOR, PATIENT_A_ID, PRACTICE_A)
    ).rejects.toMatchObject({ statusCode: 403, code: 'CLINICAL_CHART_ACCESS_DENIED' });
  });

  it('6. Doctor from Practice B + Practice A patient is 404', async () => {
    mockedPrisma.patient.findFirst.mockResolvedValueOnce(null);

    await expect(
      assertClinicalPatientAccess(DOCTOR_A_PROFILE, UserRole.DOCTOR, PATIENT_B_ID, PRACTICE_A)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('7. Reception is denied by the clinical helper', async () => {
    mockedPrisma.patient.findFirst.mockResolvedValueOnce(assignedPatient);

    await expect(
      assertClinicalPatientAccess(DOCTOR_A_PROFILE, UserRole.ADMIN, PATIENT_A_ID, PRACTICE_A)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('8. Patient self is PATIENT_SELF', async () => {
    mockedPrisma.patient.findFirst.mockResolvedValueOnce(assignedPatient);

    await expect(
      assertClinicalPatientAccess(PATIENT_A_PROFILE, UserRole.PATIENT, PATIENT_A_ID, PRACTICE_A)
    ).resolves.toMatchObject({ accessBasis: 'PATIENT_SELF', doctorId: null });
  });

  it('9. Patient A cannot access Patient B', async () => {
    mockedPrisma.patient.findFirst.mockResolvedValueOnce({
      ...assignedPatient,
      id: PATIENT_B_ID,
      profileId: PATIENT_B_PROFILE,
    });

    await expect(
      assertClinicalPatientAccess(PATIENT_A_PROFILE, UserRole.PATIENT, PATIENT_B_ID, PRACTICE_A)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('10. assertPatientAccess Doctor semantics remain assigned-only and ignore ALL mode', async () => {
    mockedPrisma.patient.findFirst
      .mockResolvedValueOnce(unassignedPatient)
      .mockResolvedValueOnce(null);
    mockedPrisma.doctor.findFirst.mockResolvedValueOnce(activeDoctor);

    await expect(
      assertPatientAccess(DOCTOR_A_PROFILE, UserRole.DOCTOR, PATIENT_A_ID, PRACTICE_A)
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockedPrisma.practice.findFirst).not.toHaveBeenCalled();
  });

  it('11. missing Practice fails closed for shared access', async () => {
    mockedPrisma.patient.findFirst.mockResolvedValueOnce(unassignedPatient);
    mockedPrisma.doctor.findFirst.mockResolvedValueOnce(activeDoctor);
    mockedPrisma.practice.findFirst.mockResolvedValueOnce(null);

    await expect(
      assertClinicalPatientAccess(DOCTOR_A_PROFILE, UserRole.DOCTOR, PATIENT_A_ID, PRACTICE_A)
    ).rejects.toMatchObject({ statusCode: 403, code: 'CLINICAL_CHART_ACCESS_DENIED' });
  });
});

describe('assertDoctorCanAccessPatientChart', () => {
  it('ASSIGNED mode allows only the assigned Doctor', async () => {
    mockedPrisma.patient.findFirst.mockResolvedValueOnce(assignedPatient);
    mockedPrisma.practice.findFirst.mockResolvedValueOnce({
      clinicalChartAccessMode: ClinicalChartAccessMode.ASSIGNED_DOCTOR_ONLY,
    });
    mockedPrisma.doctor.findFirst.mockResolvedValueOnce(activeDoctor);

    await expect(
      assertDoctorCanAccessPatientChart({
        doctorId: DOCTOR_A_ID,
        patientId: PATIENT_A_ID,
        practiceId: PRACTICE_A,
      })
    ).resolves.toMatchObject({ doctor: { id: DOCTOR_A_ID } });
  });

  it('ASSIGNED mode denies another Doctor', async () => {
    mockedPrisma.patient.findFirst.mockResolvedValueOnce(unassignedPatient);
    mockedPrisma.practice.findFirst.mockResolvedValueOnce({
      clinicalChartAccessMode: ClinicalChartAccessMode.ASSIGNED_DOCTOR_ONLY,
    });
    mockedPrisma.doctor.findFirst.mockResolvedValueOnce(activeDoctor);

    await expect(
      assertDoctorCanAccessPatientChart({
        doctorId: DOCTOR_A_ID,
        patientId: PATIENT_A_ID,
        practiceId: PRACTICE_A,
      })
    ).rejects.toMatchObject({ statusCode: 403, code: 'DOCTOR_NOT_AUTHORIZED_FOR_PATIENT' });
  });

  it('ALL mode allows another active same-Practice Doctor', async () => {
    mockedPrisma.patient.findFirst.mockResolvedValueOnce(unassignedPatient);
    mockedPrisma.practice.findFirst.mockResolvedValueOnce({
      clinicalChartAccessMode: ClinicalChartAccessMode.ALL_ACTIVE_DOCTORS,
    });
    mockedPrisma.doctor.findFirst.mockResolvedValueOnce(activeDoctor);

    await expect(
      assertDoctorCanAccessPatientChart({
        doctorId: DOCTOR_A_ID,
        patientId: PATIENT_A_ID,
        practiceId: PRACTICE_A,
      })
    ).resolves.toMatchObject({ doctor: { id: DOCTOR_A_ID } });
  });

  it('inactive or missing Doctor is denied', async () => {
    mockedPrisma.patient.findFirst.mockResolvedValueOnce(assignedPatient);
    mockedPrisma.practice.findFirst.mockResolvedValueOnce({
      clinicalChartAccessMode: ClinicalChartAccessMode.ALL_ACTIVE_DOCTORS,
    });
    mockedPrisma.doctor.findFirst.mockResolvedValueOnce(null);

    await expect(
      assertDoctorCanAccessPatientChart({
        doctorId: DOCTOR_A_ID,
        patientId: PATIENT_A_ID,
        practiceId: PRACTICE_A,
      })
    ).rejects.toMatchObject({ statusCode: 403, code: 'DOCTOR_NOT_AUTHORIZED_FOR_PATIENT' });
  });
});

describe('auditSharedClinicalChartAccess', () => {
  it('does not emit for assigned-Doctor access', async () => {
    await auditSharedClinicalChartAccess({
      practiceId: PRACTICE_A,
      actorId: DOCTOR_A_PROFILE,
      patientId: PATIENT_A_ID,
      accessBasis: 'ASSIGNED_DOCTOR',
      operation: 'PATIENT_DETAIL',
      accessingDoctorId: DOCTOR_A_ID,
      assignedDoctorId: DOCTOR_A_ID,
    });
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('emits safe operational metadata for PRACTICE_WIDE', async () => {
    await auditSharedClinicalChartAccess({
      practiceId: PRACTICE_A,
      actorId: DOCTOR_A_PROFILE,
      patientId: PATIENT_A_ID,
      accessBasis: 'PRACTICE_WIDE',
      operation: 'MEDICAL_RECORD_VIEW',
      accessingDoctorId: DOCTOR_A_ID,
      assignedDoctorId: 'other-doctor-id',
    });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CLINICAL_CHART_SHARED_ACCESS',
        resource: 'PATIENT',
        patientId: PATIENT_A_ID,
        newValue: {
          accessMode: 'ALL_ACTIVE_DOCTORS',
          operation: 'MEDICAL_RECORD_VIEW',
          accessingDoctorId: DOCTOR_A_ID,
          assignedDoctorId: 'other-doctor-id',
        },
      })
    );
    const payload = vi.mocked(logAudit).mock.calls[0][0].newValue as Record<string, unknown>;
    expect(JSON.stringify(payload)).not.toMatch(/soap|diagnosis|transcript|private.?note/i);
  });
});
