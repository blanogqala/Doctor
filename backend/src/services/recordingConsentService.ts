import { RecordingConsentMode, UserRole } from '@prisma/client';
import { createHash } from 'crypto';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import {
  assertPatientAccess,
  assertAppointmentAccess,
  getDoctorIdForProfile,
} from './accessService';
import { logAudit } from './auditService';

export async function createRecordingConsent(params: {
  practiceId: string;
  actorUserId: string;
  role: string;
  patientId: string;
  medicalRecordId?: string | null;
  appointmentId?: string | null;
  consentMode: RecordingConsentMode;
  consentTextHash?: string | null;
  ipAddress?: string;
  userAgent?: string;
}) {
  await assertPatientAccess(
    params.actorUserId,
    params.role as never,
    params.patientId,
    params.practiceId
  );

  const doctorId = await getDoctorIdForProfile(params.actorUserId, params.practiceId);
  if (!doctorId) throw new AppError(403, 'Doctor profile required');

  if (params.medicalRecordId) {
    const record = await prisma.medicalRecord.findFirst({
      where: {
        id: params.medicalRecordId,
        practiceId: params.practiceId,
        softDeletedAt: null,
      },
    });
    if (!record) throw new AppError(404, 'Medical record not found');
    if (record.patientId !== params.patientId) {
      throw new AppError(400, 'Consent patient does not match medical record');
    }
    if (record.doctorId !== doctorId) {
      throw new AppError(403, 'You can only record consent for your own records');
    }
  }

  if (params.appointmentId) {
    const appointment = await assertAppointmentAccess(
      params.actorUserId,
      params.role as UserRole,
      params.appointmentId,
      params.practiceId
    );
    if (appointment.patientId !== params.patientId) {
      throw new AppError(400, 'Appointment does not belong to this patient');
    }
    if (params.role === UserRole.DOCTOR && appointment.doctorId !== doctorId) {
      throw new AppError(403, 'Appointment is not assigned to this doctor');
    }
  }

  const consent = await prisma.consultationRecordingConsent.create({
    data: {
      practiceId: params.practiceId,
      patientId: params.patientId,
      doctorId,
      medicalRecordId: params.medicalRecordId ?? null,
      appointmentId: params.appointmentId ?? null,
      consentMode: params.consentMode,
      consentTextHash: params.consentTextHash ?? null,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
    },
  });

  await logAudit({
    practiceId: params.practiceId,
    actorId: params.actorUserId,
    action: 'SCRIBE_RECORDING_CONSENT',
    resource: 'consultation_recording_consent',
    resourceId: consent.id,
    patientId: params.patientId,
    newValue: {
      consentMode: params.consentMode,
      medicalRecordId: params.medicalRecordId ?? null,
      appointmentId: params.appointmentId ?? null,
    },
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  return consent;
}

/**
 * Verify consent belongs to this practice, doctor, and patient.
 * Rejects revoked, cross-patient, wrong-mode, or mismatched consents.
 */
export async function requireValidRecordingConsent(params: {
  consentId: string;
  practiceId: string;
  doctorId: string;
  patientId: string;
  expectedMode?: RecordingConsentMode;
  expectedMedicalRecordId?: string | null;
  expectedAppointmentId?: string | null;
}) {
  const consent = await prisma.consultationRecordingConsent.findFirst({
    where: {
      id: params.consentId,
      practiceId: params.practiceId,
    },
  });
  if (!consent) {
    throw new AppError(403, 'Recording consent required');
  }
  if (consent.revokedAt) {
    throw new AppError(403, 'Recording consent has been revoked');
  }
  if (consent.doctorId !== params.doctorId) {
    throw new AppError(403, 'Recording consent does not belong to this doctor');
  }
  if (consent.patientId !== params.patientId) {
    throw new AppError(403, 'Recording consent does not match this patient');
  }
  if (params.expectedMode && consent.consentMode !== params.expectedMode) {
    throw new AppError(403, 'Recording consent mode does not authorize this operation');
  }
  if (params.expectedMedicalRecordId !== undefined) {
    const expected = params.expectedMedicalRecordId ?? null;
    if ((consent.medicalRecordId ?? null) !== expected) {
      throw new AppError(403, 'Recording consent does not match this medical record');
    }
  }
  if (params.expectedAppointmentId !== undefined && params.expectedAppointmentId) {
    if (consent.appointmentId !== params.expectedAppointmentId) {
      throw new AppError(403, 'Recording consent does not match this appointment');
    }
  }
  const ageMs = Date.now() - consent.consentedAt.getTime();
  if (ageMs > 24 * 60 * 60 * 1000) {
    throw new AppError(403, 'Recording consent has expired. Please confirm consent again.');
  }
  return consent;
}

export function hashConsentText(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 64);
}
