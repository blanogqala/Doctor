import { UserRole } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';

export async function getDoctorIdForProfile(profileId: string, practiceId?: string) {
  const doctor = await prisma.doctor.findFirst({
    where: {
      profileId,
      ...(practiceId ? { practiceId } : {}),
    },
  });
  return doctor?.id ?? null;
}

export async function getPatientIdForProfile(profileId: string, practiceId?: string) {
  const patient = await prisma.patient.findFirst({
    where: {
      profileId,
      ...(practiceId ? { practiceId } : {}),
    },
  });
  return patient?.id ?? null;
}

export async function isDoctorForPatient(
  doctorProfileId: string,
  patientId: string,
  practiceId?: string
) {
  const doctor = await prisma.doctor.findFirst({
    where: {
      profileId: doctorProfileId,
      ...(practiceId ? { practiceId } : {}),
    },
  });
  if (!doctor) return false;
  const patient = await prisma.patient.findFirst({
    where: {
      id: patientId,
      assignedDoctorId: doctor.id,
      softDeletedAt: null,
      ...(practiceId ? { practiceId } : {}),
    },
  });
  return !!patient;
}

export async function assertPatientAccess(
  userId: string,
  role: UserRole,
  patientId: string,
  practiceId: string
) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, practiceId, softDeletedAt: null },
  });
  if (!patient) throw new AppError(404, 'Patient not found');

  if (role === UserRole.ADMIN) {
    return patient;
  }

  if (role === UserRole.PATIENT) {
    if (patient.profileId !== userId) throw new AppError(403, 'Access denied');
    return patient;
  }

  if (role === UserRole.DOCTOR) {
    const allowed = await isDoctorForPatient(userId, patientId, practiceId);
    if (!allowed) throw new AppError(403, 'Access denied');
    return patient;
  }

  throw new AppError(403, 'Access denied');
}

/**
 * Clinical chart access — practice ADMIN (reception) is intentionally excluded.
 * Only the assigned doctor or the patient themself may access clinical records.
 */
export async function assertClinicalPatientAccess(
  userId: string,
  role: UserRole,
  patientId: string,
  practiceId: string
) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, practiceId, softDeletedAt: null },
  });
  if (!patient) throw new AppError(404, 'Patient not found');

  if (role === UserRole.PATIENT) {
    if (patient.profileId !== userId) throw new AppError(403, 'Access denied');
    return patient;
  }

  if (role === UserRole.DOCTOR) {
    const allowed = await isDoctorForPatient(userId, patientId, practiceId);
    if (!allowed) throw new AppError(403, 'Access denied');
    return patient;
  }

  throw new AppError(403, 'Access denied');
}

export async function assertAppointmentAccess(
  userId: string,
  role: UserRole,
  appointmentId: string,
  practiceId: string
) {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, practiceId },
    include: { patient: true, doctor: true },
  });
  if (!appointment || appointment.softDeletedAt) {
    throw new AppError(404, 'Appointment not found');
  }

  if (role === UserRole.ADMIN) return appointment;

  if (role === UserRole.PATIENT && appointment.patient.profileId === userId) {
    return appointment;
  }

  if (role === UserRole.DOCTOR && appointment.doctor.profileId === userId) {
    return appointment;
  }

  throw new AppError(403, 'Access denied');
}
