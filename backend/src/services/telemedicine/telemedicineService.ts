import type { Appointment } from '@prisma/client';
import { UserRole } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { logAudit } from '../auditService';
import {
  CLOSED_APPOINTMENT_STATUSES,
  JOINABLE_APPOINTMENT_STATUSES,
  TELEMEDICINE_CONFIG,
  type TelemedicineSessionState,
} from '../../config/telemedicine';
import { liveKitProvider } from './livekitProvider';
import type { TelemedicineProvider } from './types';
import { safeProfileRelation } from '../../utils/safeProfile';
import { joinPersonName } from '../../utils/personName';

export function roomNameForAppointment(appointmentId: string): string {
  return `medspace-appt-${appointmentId}`;
}

export function deriveSessionState(appointment: {
  patientJoinedAt: Date | null;
  doctorJoinedAt: Date | null;
  telemedicineEndedAt: Date | null;
}): TelemedicineSessionState {
  if (appointment.telemedicineEndedAt) return 'ENDED';
  if (appointment.doctorJoinedAt && appointment.patientJoinedAt) return 'ACTIVE';
  if (appointment.patientJoinedAt) return 'WAITING';
  if (appointment.doctorJoinedAt) return 'ACTIVE';
  return 'NOT_STARTED';
}

export interface JoinWindowResult {
  canJoin: boolean;
  message?: string;
}

export function evaluateJoinWindow(
  appointment: Pick<Appointment, 'scheduledAt' | 'durationMinutes' | 'status'>,
  role: UserRole
): JoinWindowResult {
  if (CLOSED_APPOINTMENT_STATUSES.has(appointment.status)) {
    return { canJoin: false, message: 'This appointment is no longer active.' };
  }

  const now = Date.now();
  const scheduled = appointment.scheduledAt.getTime();
  const end = scheduled + appointment.durationMinutes * 60_000;
  const graceAfter = end + TELEMEDICINE_CONFIG.roomGraceAfterEndMinutes * 60_000;

  const earlyMinutes =
    role === 'DOCTOR'
      ? TELEMEDICINE_CONFIG.doctorEarlyJoinMinutes
      : TELEMEDICINE_CONFIG.patientEarlyJoinMinutes;
  const earliest = scheduled - earlyMinutes * 60_000;

  if (now < earliest) {
    const time = appointment.scheduledAt.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
    return {
      canJoin: false,
      message: `Your appointment is scheduled for ${time}. You can join the waiting room shortly before your appointment.`,
    };
  }

  if (now > graceAfter) {
    return {
      canJoin: false,
      message: 'The join window for this virtual consultation has closed.',
    };
  }

  return { canJoin: true };
}

async function assertTelemedicineParticipant(
  userId: string,
  role: UserRole,
  appointment: Appointment & { patient: { profileId: string | null; id: string }; doctor: { profileId: string; id: string } }
) {
  if (role === UserRole.ADMIN) {
    throw new AppError(403, 'Access denied');
  }
  if (appointment.type !== 'TELEMEDICINE') {
    throw new AppError(422, 'This appointment is not a telemedicine consultation.');
  }
  if (appointment.softDeletedAt) {
    throw new AppError(404, 'Appointment not found');
  }
  if (!JOINABLE_APPOINTMENT_STATUSES.has(appointment.status) && !CLOSED_APPOINTMENT_STATUSES.has(appointment.status)) {
    throw new AppError(409, 'Appointment status does not allow joining.');
  }
  if (CLOSED_APPOINTMENT_STATUSES.has(appointment.status)) {
    throw new AppError(409, 'This appointment is no longer active.');
  }

  if (role === UserRole.PATIENT) {
    if (appointment.patient.profileId !== userId) {
      throw new AppError(403, 'Access denied');
    }
    await assertPatientTelemedicineConsent(appointment.patient.id, appointment);
    return;
  }

  if (role === UserRole.DOCTOR) {
    if (appointment.doctor.profileId !== userId) {
      throw new AppError(403, 'Access denied');
    }
    return;
  }

  throw new AppError(403, 'Access denied');
}

async function assertPatientTelemedicineConsent(
  patientId: string,
  appointment: Pick<Appointment, 'patientTelemedicineDecision' | 'practiceId' | 'status'>
) {
  if (appointment.patientTelemedicineDecision === 'SWITCHED_IN_PERSON') {
    throw new AppError(422, 'Patient switched this appointment to in-person care.');
  }

  const consent = await prisma.telemedicineConsent.findFirst({
    where: {
      patientId,
      practiceId: appointment.practiceId,
      consentGiven: true,
    },
    orderBy: { signedAt: 'desc' },
  });

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, practiceId: appointment.practiceId },
    select: { consentTelemedicine: true },
  });

  const decisionOk =
    appointment.patientTelemedicineDecision === 'ACCEPTED_VIDEO' ||
    appointment.patientTelemedicineDecision === null;

  if (consent || patient?.consentTelemedicine) {
    return;
  }

  if (appointment.patientTelemedicineDecision === 'ACCEPTED_VIDEO') {
    return;
  }

  if (decisionOk && appointment.status === 'CONFIRMED_TELEMEDICINE') {
    throw new AppError(422, 'Telemedicine consent is required before joining.');
  }

  throw new AppError(422, 'Telemedicine consent is required before joining.');
}

async function loadAppointment(appointmentId: string, practiceId: string) {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, practiceId, softDeletedAt: null },
    include: {
      patient: { include: { profile: safeProfileRelation } },
      doctor: { include: { profile: safeProfileRelation } },
    },
  });
  if (!appointment) {
    throw new AppError(404, 'Appointment not found');
  }
  return appointment;
}

function participantIdentity(role: UserRole, userId: string): string {
  return role === UserRole.DOCTOR ? `doctor:${userId}` : `patient:${userId}`;
}

function appointmentPatientName(appointment: {
  patient: { firstName?: string; lastName?: string; profile?: { fullName: string } | null };
}): string {
  if (appointment.patient.firstName || appointment.patient.lastName) {
    return joinPersonName(appointment.patient.firstName ?? '', appointment.patient.lastName ?? '');
  }
  return appointment.patient.profile?.fullName ?? 'Patient';
}

function participantDisplayName(
  role: UserRole,
  appointment: Awaited<ReturnType<typeof loadAppointment>>
): string {
  if (role === UserRole.DOCTOR) {
    return appointment.doctor.profile.fullName ?? 'Doctor';
  }
  return appointmentPatientName(appointment);
}

export class TelemedicineService {
  constructor(private readonly provider: TelemedicineProvider = liveKitProvider) {}

  isProviderConfigured(): boolean {
    return this.provider.isConfigured();
  }

  async getStatus(input: {
    appointmentId: string;
    practiceId: string;
    userId: string;
    role: UserRole;
  }) {
    const appointment = await loadAppointment(input.appointmentId, input.practiceId);
    await assertTelemedicineParticipant(input.userId, input.role, appointment);

    const joinWindow = evaluateJoinWindow(appointment, input.role);
    const sessionState = deriveSessionState(appointment);
    const providerConfigured = this.provider.isConfigured();

    return {
      sessionState,
      providerConfigured,
      joinWindow,
      appointment: {
        id: appointment.id,
        scheduledAt: appointment.scheduledAt.toISOString(),
        status: appointment.status,
        doctorName: appointment.doctor.profile.fullName,
        patientName: appointmentPatientName(appointment),
        doctorJoinedAt: appointment.doctorJoinedAt?.toISOString() ?? null,
        patientJoinedAt: appointment.patientJoinedAt?.toISOString() ?? null,
        telemedicineEndedAt: appointment.telemedicineEndedAt?.toISOString() ?? null,
        reason: appointment.reason,
      },
    };
  }

  async join(input: {
    appointmentId: string;
    practiceId: string;
    userId: string;
    role: UserRole;
    actorId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }) {
    if (!this.provider.isConfigured()) {
      throw new AppError(
        503,
        'Virtual consultations are temporarily unavailable. Please try again shortly.'
      );
    }

    const appointment = await loadAppointment(input.appointmentId, input.practiceId);
    await assertTelemedicineParticipant(input.userId, input.role, appointment);

    if (appointment.telemedicineEndedAt) {
      const endedAt = appointment.telemedicineEndedAt.getTime();
      const graceEnd =
        endedAt + TELEMEDICINE_CONFIG.roomGraceAfterEndMinutes * 60_000;
      if (Date.now() > graceEnd) {
        throw new AppError(409, 'This virtual consultation has ended.');
      }
    }

    const joinWindow = evaluateJoinWindow(appointment, input.role);
    if (!joinWindow.canJoin) {
      await logAudit({
        practiceId: input.practiceId,
        actorId: input.actorId,
        action: 'TELEMEDICINE_JOIN_DENIED',
        resource: 'appointment',
        resourceId: appointment.id,
        patientId: appointment.patientId,
        newValue: { reason: 'join_window', role: input.role },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });
      throw new AppError(422, joinWindow.message ?? 'Join is not available yet.');
    }

    const roomName =
      appointment.telemedicineRoomId ?? roomNameForAppointment(appointment.id);
    const now = new Date();

    await this.provider.createRoom(roomName, {
      appointmentId: appointment.id,
      practiceId: input.practiceId,
    });

    const updateData: {
      telemedicineRoomId?: string;
      patientJoinedAt?: Date;
      doctorJoinedAt?: Date;
      consultationStartedAt?: Date;
      telemedicineStartedAt?: Date;
      status?: typeof appointment.status;
      lockedByDoctorId?: string;
    } = {};

    if (!appointment.telemedicineRoomId) {
      updateData.telemedicineRoomId = roomName;
    }

    if (input.role === UserRole.PATIENT) {
      if (!appointment.patientJoinedAt) {
        updateData.patientJoinedAt = now;
      }
    }

    if (input.role === UserRole.DOCTOR) {
      if (!appointment.doctorJoinedAt) {
        updateData.doctorJoinedAt = now;
      }
      if (appointment.status !== 'IN_CONSULTATION') {
        updateData.status = 'IN_CONSULTATION';
      }
      if (!appointment.consultationStartedAt) {
        updateData.consultationStartedAt = now;
      }
      if (!appointment.lockedByDoctorId) {
        updateData.lockedByDoctorId = appointment.doctorId;
      }
    }

    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: updateData,
      include: {
        patient: { include: { profile: safeProfileRelation } },
        doctor: { include: { profile: safeProfileRelation } },
      },
    });

    const bothJoined = Boolean(updated.patientJoinedAt && updated.doctorJoinedAt);
    if (bothJoined && !updated.telemedicineStartedAt) {
      await prisma.appointment.update({
        where: { id: updated.id },
        data: { telemedicineStartedAt: now },
      });
      updated.telemedicineStartedAt = now;
    }

    const token = await this.provider.createParticipantToken({
      roomName,
      identity: participantIdentity(input.role, input.userId),
      displayName: participantDisplayName(input.role, updated),
      role: input.role === UserRole.DOCTOR ? 'doctor' : 'patient',
      ttlSeconds: TELEMEDICINE_CONFIG.tokenTtlSeconds,
    });

    const sessionState = deriveSessionState(updated);
    const auditAction =
      input.role === UserRole.PATIENT
        ? updated.doctorJoinedAt
          ? 'TELEMEDICINE_CALL_STARTED'
          : 'TELEMEDICINE_PATIENT_JOINED_WAITING_ROOM'
        : updated.patientJoinedAt
          ? 'TELEMEDICINE_CALL_STARTED'
          : 'TELEMEDICINE_DOCTOR_JOINED';

    await logAudit({
      practiceId: input.practiceId,
      actorId: input.actorId,
      action: auditAction,
      resource: 'appointment',
      resourceId: updated.id,
      patientId: updated.patientId,
      newValue: { role: input.role, sessionState },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    return {
      sessionState,
      livekit: {
        url: this.provider.getPublicUrl()!,
        token,
        roomName,
      },
      appointment: {
        id: updated.id,
        scheduledAt: updated.scheduledAt.toISOString(),
        status: updated.status,
        doctorName: updated.doctor.profile.fullName,
        patientName: appointmentPatientName(updated),
        doctorJoinedAt: updated.doctorJoinedAt?.toISOString() ?? null,
        patientJoinedAt: updated.patientJoinedAt?.toISOString() ?? null,
        telemedicineStartedAt: updated.telemedicineStartedAt?.toISOString() ?? null,
        telemedicineEndedAt: updated.telemedicineEndedAt?.toISOString() ?? null,
        reason: updated.reason,
      },
      joinWindow,
    };
  }

  async leave(input: {
    appointmentId: string;
    practiceId: string;
    userId: string;
    role: UserRole;
    actorId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }) {
    const appointment = await loadAppointment(input.appointmentId, input.practiceId);
    await assertTelemedicineParticipant(input.userId, input.role, appointment);

    const data: { patientJoinedAt?: null; doctorJoinedAt?: null } = {};
    if (input.role === UserRole.PATIENT) {
      data.patientJoinedAt = null;
    } else if (input.role === UserRole.DOCTOR) {
      data.doctorJoinedAt = null;
    }

    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data,
    });

    await logAudit({
      practiceId: input.practiceId,
      actorId: input.actorId,
      action: 'TELEMEDICINE_CALL_ENDED',
      resource: 'appointment',
      resourceId: updated.id,
      patientId: updated.patientId,
      newValue: { role: input.role, event: 'leave' },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    return { sessionState: deriveSessionState(updated) };
  }

  async end(input: {
    appointmentId: string;
    practiceId: string;
    userId: string;
    role: UserRole;
    actorId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }) {
    if (input.role !== UserRole.DOCTOR) {
      throw new AppError(403, 'Access denied');
    }

    const appointment = await loadAppointment(input.appointmentId, input.practiceId);
    await assertTelemedicineParticipant(input.userId, input.role, appointment);

    const roomName =
      appointment.telemedicineRoomId ?? roomNameForAppointment(appointment.id);
    const now = new Date();

    if (this.provider.isConfigured()) {
      try {
        await this.provider.endRoom(roomName);
      } catch (err) {
        console.error('[telemedicine] provider endRoom failed:', err);
      }
    }

    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: { telemedicineEndedAt: now },
    });

    await logAudit({
      practiceId: input.practiceId,
      actorId: input.actorId,
      action: 'TELEMEDICINE_CALL_ENDED',
      resource: 'appointment',
      resourceId: updated.id,
      patientId: updated.patientId,
      newValue: { role: input.role, event: 'doctor_end' },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    return { sessionState: deriveSessionState(updated) };
  }
}

export const telemedicineService = new TelemedicineService();
