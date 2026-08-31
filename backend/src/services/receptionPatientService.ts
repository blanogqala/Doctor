import {
  PatientPortalStatus,
  PatientRegistrationSource,
  Prisma,
  UserRole,
} from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { appointmentInclude, patientInclude } from '../utils/includes';
import { logAudit } from './auditService';
import { assertPatientEmailAvailable } from './patientEmailUniqueness';
import { assertActiveDoctorInPractice } from './activeDoctor';

function normalizeName(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeOptional(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

export async function createReceptionPatient(
  data: {
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
    patient?: Record<string, unknown>;
  },
  practiceId: string,
  actorId: string
) {
  const firstName = normalizeName(data.firstName);
  const lastName = normalizeName(data.lastName);
  if (!firstName || !lastName) {
    throw new AppError(400, 'First name and surname are required');
  }

  const extra = data.patient ?? {};
  const email = normalizeOptional(data.email ?? extra.email);
  const phone = normalizeOptional(data.phone ?? extra.phone);
  const assignedDoctorId = (extra.assigned_doctor_id as string) ?? null;

  if (email) {
    await assertPatientEmailAvailable(prisma, { practiceId, email });
  }
  if (assignedDoctorId) {
    await assertActiveDoctorInPractice(prisma, assignedDoctorId, practiceId, {
      inactiveMessage: 'This Doctor is inactive and cannot receive new patient assignments.',
    });
  }

  const created = await prisma.patient.create({
    data: {
      practiceId,
      firstName,
      lastName,
      email: email ?? null,
      phone: phone ?? null,
      registrationSource: PatientRegistrationSource.RECEPTION_CREATED,
      portalStatus: PatientPortalStatus.NO_PORTAL_ACCESS,
      idNumber: (extra.id_number as string) ?? null,
      idNumberLast4: extra.id_number ? String(extra.id_number).slice(-4) : null,
      dateOfBirth: extra.date_of_birth ? new Date(String(extra.date_of_birth)) : null,
      gender: (extra.gender as never) ?? 'UNKNOWN',
      address: (extra.address as string) ?? null,
      city: (extra.city as string) ?? null,
      province: (extra.province as string) ?? 'Eastern Cape',
      medicalAidProvider: (extra.medical_aid_provider as string) ?? null,
      medicalAidNumber: (extra.medical_aid_number as string) ?? null,
      emergencyContactName: (extra.emergency_contact_name as string) ?? null,
      emergencyContactPhone: (extra.emergency_contact_phone as string) ?? null,
      assignedDoctorId,
    },
    include: patientInclude,
  });

  await logAudit({
    practiceId,
    actorId,
    action: 'PATIENT_CREATED_BY_RECEPTION',
    resource: 'PATIENT',
    resourceId: created.id,
    patientId: created.id,
    newValue: { firstName, lastName },
  });

  return created;
}

export async function createReceptionPatientWithAppointment(params: {
  practiceId: string;
  actorId: string;
  firstName: string;
  lastName: string;
  doctorId: string;
  scheduledAt: Date;
  durationMinutes: number;
  type?: string;
  status?: string;
  reason?: string | null;
  notes?: string | null;
}) {
  const firstName = normalizeName(params.firstName);
  const lastName = normalizeName(params.lastName);
  if (!firstName || !lastName) {
    throw new AppError(400, 'First name and surname are required');
  }

  const created = await prisma.$transaction(async (tx) => {
    const patient = await tx.patient.create({
      data: {
        practiceId: params.practiceId,
        firstName,
        lastName,
        registrationSource: PatientRegistrationSource.RECEPTION_CREATED,
        portalStatus: PatientPortalStatus.NO_PORTAL_ACCESS,
      },
    });
    const appointment = await tx.appointment.create({
      data: {
        practiceId: params.practiceId,
        patientId: patient.id,
        doctorId: params.doctorId,
        createdBy: params.actorId,
        scheduledAt: params.scheduledAt,
        durationMinutes: params.durationMinutes,
        type: (params.type as never) ?? 'IN_PERSON',
        status: (params.status as never) ?? 'PENDING',
        reason: params.reason ?? null,
        notes: params.notes ?? null,
      },
    });
    return { patient, appointment };
  });

  await logAudit({
    practiceId: params.practiceId,
    actorId: params.actorId,
    action: 'PATIENT_CREATED_BY_RECEPTION',
    resource: 'PATIENT',
    resourceId: created.patient.id,
    patientId: created.patient.id,
    newValue: { firstName, lastName },
  });

  const appointment = await prisma.appointment.findFirst({
    where: { id: created.appointment.id, practiceId: params.practiceId },
    include: appointmentInclude,
  });
  if (!appointment) {
    throw new AppError(500, 'Appointment was not created');
  }
  return appointment;
}

export function buildPatientNameSearchWhere(
  practiceId: string,
  q: string
): Prisma.PatientWhereInput {
  const query = q.trim();
  const parts = query.split(/\s+/).filter(Boolean);
  const nameClauses: Prisma.PatientWhereInput[] = [
    { firstName: { contains: query, mode: 'insensitive' } },
    { lastName: { contains: query, mode: 'insensitive' } },
  ];
  if (parts.length >= 2) {
    nameClauses.push({
      AND: [
        { firstName: { contains: parts[0], mode: 'insensitive' } },
        { lastName: { contains: parts.slice(1).join(' '), mode: 'insensitive' } },
      ],
    });
  }
  return {
    practiceId,
    softDeletedAt: null,
    OR: nameClauses,
  };
}

export async function listPracticePatients(params: {
  practiceId: string;
  role: UserRole;
  userId: string;
  q?: string;
}) {
  const { practiceId, role, userId, q } = params;
  const scope: Prisma.PatientWhereInput =
    role === UserRole.ADMIN
      ? { softDeletedAt: null, practiceId }
      : role === UserRole.DOCTOR
        ? {
            softDeletedAt: null,
            practiceId,
            assignedDoctor: { profileId: userId, practiceId },
          }
        : { profileId: userId, softDeletedAt: null, practiceId };

  const where: Prisma.PatientWhereInput = q?.trim()
    ? { AND: [scope, buildPatientNameSearchWhere(practiceId, q)] }
    : scope;

  return prisma.patient.findMany({
    where,
    include: patientInclude,
    orderBy: { createdAt: 'desc' },
  });
}
