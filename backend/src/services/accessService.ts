import { ClinicalChartAccessMode, UserRole } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { activeDoctorWhere } from './activeDoctor';
import { logAudit } from './auditService';

export type ClinicalAccessBasis = 'PATIENT_SELF' | 'ASSIGNED_DOCTOR' | 'PRACTICE_WIDE';

export type SharedClinicalAccessOperation =
  | 'PATIENT_DETAIL'
  | 'MEDICAL_RECORD_LIST'
  | 'MEDICAL_RECORD_VIEW'
  | 'MEDICAL_RECORD_CREATE'
  | 'CHECKUP_CREATE'
  | 'AI_SCRIBE'
  | 'AI_DOCUMENT';

export interface ClinicalPatientAccess {
  patient: {
    id: string;
    practiceId: string;
    profileId: string | null;
    assignedDoctorId: string | null;
    softDeletedAt: Date | null;
  };
  doctorId: string | null;
  accessBasis: ClinicalAccessBasis;
}

function clinicalChartDenied() {
  return new AppError(
    403,
    "You do not have access to this patient's clinical chart.",
    'CLINICAL_CHART_ACCESS_DENIED'
  );
}

function targetDoctorDenied() {
  return new AppError(
    403,
    'The selected Doctor is not authorized for this patient.',
    'DOCTOR_NOT_AUTHORIZED_FOR_PATIENT'
  );
}

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

function isActiveDoctorProfile(profile: {
  role: UserRole;
  isActive: boolean;
  softDeletedAt: Date | null;
} | null | undefined) {
  return Boolean(
    profile &&
      profile.role === UserRole.DOCTOR &&
      profile.isActive &&
      profile.softDeletedAt == null
  );
}

/**
 * GENERAL / OPERATIONAL patient access.
 *
 * This is NOT the shared clinical-chart authorization helper.
 * Doctor semantics remain assigned-Doctor-only so ALL_ACTIVE_DOCTORS never
 * grants PATCH of demographics, assignedDoctorId, summary fields, or other
 * operational patient mutations.
 *
 * ADMIN: any non-deleted patient in the Practice.
 * PATIENT: self only.
 * DOCTOR: patient.assignedDoctorId === current Doctor.id only.
 */
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
 * CLINICAL CHART access — practice ADMIN (reception) is intentionally excluded.
 *
 * Policy is read from the current Practice row on every call (database is
 * authoritative; frontend AuthUser.clinical_chart_access_mode is not).
 *
 * Doctor:
 *   assigned Doctor → ASSIGNED_DOCTOR
 *   else ALL_ACTIVE_DOCTORS + active same-Practice Doctor → PRACTICE_WIDE
 *   else CLINICAL_CHART_ACCESS_DENIED
 * Patient: PATIENT_SELF when the same Profile.
 * Cross-Practice / missing patient: 404 (no existence leak).
 */
export async function assertClinicalPatientAccess(
  userId: string,
  role: UserRole,
  patientId: string,
  practiceId: string
): Promise<ClinicalPatientAccess> {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, practiceId, softDeletedAt: null },
  });
  if (!patient) throw new AppError(404, 'Patient not found');

  if (role === UserRole.PATIENT) {
    if (patient.profileId !== userId) throw new AppError(403, 'Access denied');
    return { patient, doctorId: null, accessBasis: 'PATIENT_SELF' };
  }

  if (role === UserRole.DOCTOR) {
    const doctor = await prisma.doctor.findFirst({
      where: { profileId: userId, practiceId },
      include: {
        profile: { select: { role: true, isActive: true, softDeletedAt: true } },
      },
    });
    if (!doctor || !isActiveDoctorProfile(doctor.profile)) {
      throw clinicalChartDenied();
    }

    if (patient.assignedDoctorId === doctor.id) {
      return { patient, doctorId: doctor.id, accessBasis: 'ASSIGNED_DOCTOR' };
    }

    const practice = await prisma.practice.findFirst({
      where: { id: practiceId, softDeletedAt: null },
      select: { clinicalChartAccessMode: true },
    });
    if (!practice) {
      throw clinicalChartDenied();
    }

    if (practice.clinicalChartAccessMode === ClinicalChartAccessMode.ALL_ACTIVE_DOCTORS) {
      return { patient, doctorId: doctor.id, accessBasis: 'PRACTICE_WIDE' };
    }

    throw clinicalChartDenied();
  }

  throw new AppError(403, 'Access denied');
}

/**
 * Validate a SELECTED Doctor (not necessarily the current actor) against the
 * Practice clinical-chart policy. Used when creating a MedicalRecord on behalf
 * of a target Doctor (e.g. check-up booking).
 *
 * Never allows cross-Practice, inactive, or soft-deleted Doctors.
 */
export async function assertDoctorCanAccessPatientChart(params: {
  doctorId: string;
  patientId: string;
  practiceId: string;
}) {
  const patient = await prisma.patient.findFirst({
    where: {
      id: params.patientId,
      practiceId: params.practiceId,
      softDeletedAt: null,
    },
  });
  if (!patient) throw new AppError(404, 'Patient not found');

  const practice = await prisma.practice.findFirst({
    where: { id: params.practiceId, softDeletedAt: null },
    select: { clinicalChartAccessMode: true },
  });
  if (!practice) {
    throw targetDoctorDenied();
  }

  const doctor = await prisma.doctor.findFirst({
    where: {
      id: params.doctorId,
      ...activeDoctorWhere(params.practiceId),
    },
  });
  if (!doctor) {
    throw targetDoctorDenied();
  }

  if (practice.clinicalChartAccessMode === ClinicalChartAccessMode.ASSIGNED_DOCTOR_ONLY) {
    if (patient.assignedDoctorId !== doctor.id) {
      throw targetDoctorDenied();
    }
  }

  return { patient, doctor, accessMode: practice.clinicalChartAccessMode };
}

/**
 * High-value shared-chart audit. Emits CLINICAL_CHART_SHARED_ACCESS only when
 * access was granted because ALL_ACTIVE_DOCTORS and the actor is not the
 * assigned Doctor. Never used for directory listings.
 */
export async function auditSharedClinicalChartAccess(params: {
  practiceId: string;
  actorId: string;
  patientId: string;
  accessBasis: ClinicalAccessBasis;
  operation: SharedClinicalAccessOperation;
  accessingDoctorId: string | null;
  assignedDoctorId: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  if (params.accessBasis !== 'PRACTICE_WIDE') return;

  await logAudit({
    practiceId: params.practiceId,
    actorId: params.actorId,
    action: 'CLINICAL_CHART_SHARED_ACCESS',
    resource: 'PATIENT',
    resourceId: params.patientId,
    patientId: params.patientId,
    newValue: {
      accessMode: 'ALL_ACTIVE_DOCTORS',
      operation: params.operation,
      accessingDoctorId: params.accessingDoctorId,
      assignedDoctorId: params.assignedDoctorId,
    },
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });
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
