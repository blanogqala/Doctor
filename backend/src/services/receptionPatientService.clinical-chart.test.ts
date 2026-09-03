import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClinicalChartAccessMode, UserRole } from '@prisma/client';

vi.mock('../config/database', () => ({
  prisma: {
    practice: { findFirst: vi.fn() },
    doctor: { findFirst: vi.fn() },
    patient: { findMany: vi.fn(), create: vi.fn() },
    appointment: { create: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('./auditService', () => ({
  logAudit: vi.fn(),
}));

import { prisma } from '../config/database';
import {
  createReceptionPatientWithAppointment,
  listPracticePatients,
} from './receptionPatientService';

const mockedPrisma = prisma as unknown as {
  practice: { findFirst: ReturnType<typeof vi.fn> };
  doctor: { findFirst: ReturnType<typeof vi.fn> };
  patient: { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  appointment: { create: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

describe('listPracticePatients clinical chart directory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPrisma.patient.findMany.mockResolvedValue([]);
  });

  it('ASSIGNED mode returns assigned-patient scope', async () => {
    mockedPrisma.practice.findFirst.mockResolvedValue({
      clinicalChartAccessMode: ClinicalChartAccessMode.ASSIGNED_DOCTOR_ONLY,
    });
    mockedPrisma.doctor.findFirst.mockResolvedValue({ id: 'doc-1' });

    await listPracticePatients({
      practiceId: 'prac-1',
      role: UserRole.DOCTOR,
      userId: 'profile-1',
    });

    expect(mockedPrisma.patient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          assignedDoctor: { profileId: 'profile-1', practiceId: 'prac-1' },
        }),
      })
    );
  });

  it('ALL mode returns Practice patients for an active Doctor', async () => {
    mockedPrisma.practice.findFirst.mockResolvedValue({
      clinicalChartAccessMode: ClinicalChartAccessMode.ALL_ACTIVE_DOCTORS,
    });
    mockedPrisma.doctor.findFirst.mockResolvedValue({ id: 'doc-1' });

    await listPracticePatients({
      practiceId: 'prac-1',
      role: UserRole.DOCTOR,
      userId: 'profile-1',
    });

    const where = mockedPrisma.patient.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ softDeletedAt: null, practiceId: 'prac-1' });
    expect(where.assignedDoctor).toBeUndefined();
  });

  it('inactive Doctor cannot use the shared directory', async () => {
    mockedPrisma.practice.findFirst.mockResolvedValue({
      clinicalChartAccessMode: ClinicalChartAccessMode.ALL_ACTIVE_DOCTORS,
    });
    mockedPrisma.doctor.findFirst.mockResolvedValue(null);

    await listPracticePatients({
      practiceId: 'prac-1',
      role: UserRole.DOCTOR,
      userId: 'profile-1',
    });

    expect(mockedPrisma.patient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          assignedDoctor: { profileId: 'profile-1', practiceId: 'prac-1' },
        }),
      })
    );
  });
});

describe('createReceptionPatientWithAppointment assignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets assignedDoctorId to the booked Doctor in the same transaction', async () => {
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        patient: {
          create: vi.fn().mockResolvedValue({ id: 'pat-1' }),
        },
        appointment: {
          create: vi.fn().mockResolvedValue({ id: 'appt-1' }),
        },
      };
      const result = await fn(tx);
      expect(tx.patient.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ assignedDoctorId: 'doc-1' }),
        })
      );
      return result;
    });
    mockedPrisma.appointment.findFirst.mockResolvedValue({ id: 'appt-1', patient: { id: 'pat-1' } });

    await createReceptionPatientWithAppointment({
      practiceId: 'prac-1',
      actorId: 'admin-1',
      firstName: 'Ada',
      lastName: 'Patient',
      doctorId: 'doc-1',
      scheduledAt: new Date('2026-09-04T09:00:00.000Z'),
      durationMinutes: 30,
    });
  });

  it('rolls back patient creation when appointment create fails', async () => {
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        patient: { create: vi.fn().mockResolvedValue({ id: 'pat-1' }) },
        appointment: {
          create: vi.fn().mockRejectedValue(new Error('slot taken')),
        },
      };
      return fn(tx);
    });

    await expect(
      createReceptionPatientWithAppointment({
        practiceId: 'prac-1',
        actorId: 'admin-1',
        firstName: 'Ada',
        lastName: 'Patient',
        doctorId: 'doc-1',
        scheduledAt: new Date('2026-09-04T09:00:00.000Z'),
        durationMinutes: 30,
      })
    ).rejects.toThrow('slot taken');
  });
});
