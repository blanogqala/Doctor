import { AppointmentStatus, MessageType, UserRole } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { messageInclude } from '../utils/includes';
import { joinPersonName } from '../utils/personName';
import { safeProfileRelation } from '../utils/safeProfile';

const ACTIVE_BOOKING_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.PENDING,
  AppointmentStatus.PENDING_IN_PERSON,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.CONFIRMED_IN_PERSON,
  AppointmentStatus.CONFIRMED_TELEMEDICINE,
];

type AppointmentWithRelations = {
  id: string;
  practiceId: string;
  patientId: string;
  doctorId: string;
  scheduledAt: Date;
  status: AppointmentStatus;
  patient: {
    id: string;
    profileId: string | null;
    firstName?: string;
    lastName?: string;
    profile: { id: string; fullName: string } | null;
  };
  doctor: { id: string; profile: { fullName: string } };
};

function patientLabel(patient: AppointmentWithRelations['patient']): string {
  if (patient.firstName || patient.lastName) {
    return joinPersonName(patient.firstName ?? '', patient.lastName ?? '');
  }
  return patient.profile?.fullName ?? 'Patient';
}

function formatApptWhen(scheduledAt: Date) {
  const date = scheduledAt.toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const time = scheduledAt.toLocaleTimeString('en-ZA', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return { date, time };
}

/** Avoid "Dr. Dr. Sipho" when the profile name already includes a title. */
function doctorLabel(fullName: string) {
  const trimmed = fullName.trim();
  if (/^dr\.?\s/i.test(trimmed)) return trimmed;
  return `Dr. ${trimmed}`;
}

export async function getPrimaryAdminProfileId(practiceId: string): Promise<string> {
  const admin = await prisma.profile.findFirst({
    where: { role: UserRole.ADMIN, isActive: true, softDeletedAt: null, practiceId },
    orderBy: { createdAt: 'asc' },
  });
  if (!admin) throw new AppError(500, 'No active admin account found');
  return admin.id;
}

export function isAllowedChatPair(senderRole: UserRole, recipientRole: UserRole): boolean {
  const pair = `${senderRole}->${recipientRole}`;
  return (
    pair === 'PATIENT->ADMIN' ||
    pair === 'ADMIN->PATIENT' ||
    pair === 'PATIENT->DOCTOR' ||
    pair === 'DOCTOR->PATIENT' ||
    pair === 'ADMIN->DOCTOR' ||
    pair === 'DOCTOR->ADMIN'
  );
}

export async function sendSystemMessage(params: {
  practiceId: string;
  senderId: string;
  recipientId: string;
  patientId: string;
  body: string;
  appointmentId?: string | null;
}) {
  return prisma.message.create({
    data: {
      practiceId: params.practiceId,
      senderId: params.senderId,
      recipientId: params.recipientId,
      patientId: params.patientId,
      appointmentId: params.appointmentId ?? null,
      type: MessageType.SYSTEM,
      body: params.body,
    },
    include: messageInclude,
  });
}

async function loadAppointmentForNotify(appointmentId: string): Promise<AppointmentWithRelations | null> {
  return prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: { include: { profile: safeProfileRelation } },
      doctor: { include: { profile: safeProfileRelation } },
    },
  }) as Promise<AppointmentWithRelations | null>;
}

export async function notifyAppointmentBooked(appointmentId: string) {
  const appointment = await loadAppointmentForNotify(appointmentId);
  if (!appointment) return;

  const practiceId = appointment.practiceId;
  const adminId = await getPrimaryAdminProfileId(practiceId);
  const patientProfileId = appointment.patient.profileId;
  const doctor = doctorLabel(appointment.doctor.profile.fullName);
  const patientName = patientLabel(appointment.patient);
  const { date, time } = formatApptWhen(appointment.scheduledAt);

  if (patientProfileId) {
    await sendSystemMessage({
      practiceId,
      senderId: adminId,
      recipientId: patientProfileId,
      patientId: appointment.patientId,
      appointmentId: appointment.id,
      body: `We have received your appointment request with ${doctor} on ${date} at ${time}. Please do not be late. The clinic will review and confirm whether it will be in-person or telemedicine.`,
    });
  }

  await sendSystemMessage({
    practiceId,
    senderId: patientProfileId ?? adminId,
    recipientId: adminId,
    patientId: appointment.patientId,
    appointmentId: appointment.id,
    body: `${patientName} requested an appointment with ${doctor} on ${date} at ${time}.`,
  });
}

export async function notifyAppointmentReminder(appointmentId: string) {
  const appointment = await loadAppointmentForNotify(appointmentId);
  if (!appointment) return;

  const practiceId = appointment.practiceId;
  const adminId = await getPrimaryAdminProfileId(practiceId);
  const patientProfileId = appointment.patient.profileId;
  const doctor = doctorLabel(appointment.doctor.profile.fullName);
  const { date, time } = formatApptWhen(appointment.scheduledAt);

  if (patientProfileId) {
    await sendSystemMessage({
      practiceId,
      senderId: adminId,
      recipientId: patientProfileId,
      patientId: appointment.patientId,
      appointmentId: appointment.id,
      body: `Reminder: your appointment with ${doctor} is on ${date} at ${time} (in about 30 minutes). Please do not be late. If you miss the scheduled time, the appointment will be cancelled as a no-show. You can reschedule from Book Appointment if needed.`,
    });
  }

  await sendSystemMessage({
    practiceId,
    senderId: patientProfileId ?? adminId,
    recipientId: adminId,
    patientId: appointment.patientId,
    appointmentId: appointment.id,
    body: `Reminder sent: ${patientLabel(appointment.patient)} has an appointment with ${doctor} on ${date} at ${time} (about 30 minutes).`,
  });
}

export async function notifyAppointmentNoShow(appointmentId: string) {
  const appointment = await loadAppointmentForNotify(appointmentId);
  if (!appointment) return;

  const practiceId = appointment.practiceId;
  const adminId = await getPrimaryAdminProfileId(practiceId);
  const patientProfileId = appointment.patient.profileId;
  const doctor = doctorLabel(appointment.doctor.profile.fullName);
  const patientName = patientLabel(appointment.patient);
  const { date, time } = formatApptWhen(appointment.scheduledAt);

  if (patientProfileId) {
    await sendSystemMessage({
      practiceId,
      senderId: adminId,
      recipientId: patientProfileId,
      patientId: appointment.patientId,
      appointmentId: appointment.id,
      body: `Your appointment with ${doctor} on ${date} at ${time} was cancelled because you did not show up. Please book a new time if you still need to be seen.`,
    });
  }

  await sendSystemMessage({
    practiceId,
    senderId: patientProfileId ?? adminId,
    recipientId: adminId,
    patientId: appointment.patientId,
    appointmentId: appointment.id,
    body: `Appointment cancelled (no-show): ${patientName} did not arrive for ${doctor} on ${date} at ${time}.`,
  });
}

export async function startAdminChat(patientProfileId: string, practiceId: string) {
  const patient = await prisma.patient.findFirst({
    where: { profileId: patientProfileId, practiceId, softDeletedAt: null },
    include: { profile: safeProfileRelation },
  });
  if (!patient) throw new AppError(404, 'Patient record not found');

  const adminId = await getPrimaryAdminProfileId(practiceId);
  const admin = await prisma.profile.findUniqueOrThrow({
    where: { id: adminId },
    select: safeProfileRelation.select,
  });

  const existing = await prisma.message.findFirst({
    where: {
      practiceId,
      patientId: patient.id,
      OR: [
        { senderId: adminId, recipientId: patientProfileId },
        { senderId: patientProfileId, recipientId: adminId },
      ],
    },
  });

  if (!existing) {
    await sendSystemMessage({
      practiceId,
      senderId: adminId,
      recipientId: patientProfileId,
      patientId: patient.id,
      body: 'Hello! You can message clinic reception here. How can we help?',
    });
  }

  return {
    admin,
    patient,
    patient_id: patient.id,
    admin_id: adminId,
  };
}

export { ACTIVE_BOOKING_STATUSES };

export async function notifyCheckUpBooked(appointmentId: string, isTelemedicine: boolean) {
  const appointment = await loadAppointmentForNotify(appointmentId);
  if (!appointment) return;

  const practiceId = appointment.practiceId;
  const adminId = await getPrimaryAdminProfileId(practiceId);
  const patientProfileId = appointment.patient.profileId;
  const doctorProfile = await prisma.doctor.findUnique({
    where: { id: appointment.doctorId },
    select: { profileId: true, profile: { select: { fullName: true } } },
  });
  if (!doctorProfile) return;

  const doctor = doctorLabel(doctorProfile.profile.fullName);
  const patientName = patientLabel(appointment.patient);
  const { date, time } = formatApptWhen(appointment.scheduledAt);
  const mode = isTelemedicine ? 'telemedicine (video)' : 'in-person';

  if (patientProfileId) {
    await sendSystemMessage({
      practiceId,
      senderId: adminId,
      recipientId: patientProfileId,
      patientId: appointment.patientId,
      appointmentId: appointment.id,
      body: isTelemedicine
        ? `A check-up appointment with ${doctor} was booked for ${date} at ${time} as ${mode}. Please confirm the video call or choose to come in person instead.`
        : `A check-up appointment with ${doctor} was booked for ${date} at ${time} (${mode}). Please do not be late.`,
    });
  }

  await sendSystemMessage({
    practiceId,
    senderId: adminId,
    recipientId: doctorProfile.profileId,
    patientId: appointment.patientId,
    appointmentId: appointment.id,
    body: `Check-up booked for ${patientName} on ${date} at ${time} (${mode}).`,
  });
}

export async function notifyTelemedicineDecision(
  appointmentId: string,
  decision: 'ACCEPTED_VIDEO' | 'SWITCHED_IN_PERSON'
) {
  const appointment = await loadAppointmentForNotify(appointmentId);
  if (!appointment) return;

  const practiceId = appointment.practiceId;
  const adminId = await getPrimaryAdminProfileId(practiceId);
  const doctorProfile = await prisma.doctor.findUnique({
    where: { id: appointment.doctorId },
    select: { profileId: true, profile: { select: { fullName: true } } },
  });
  if (!doctorProfile) return;

  const patientName = patientLabel(appointment.patient);
  const { date, time } = formatApptWhen(appointment.scheduledAt);
  const decisionText =
    decision === 'ACCEPTED_VIDEO'
      ? 'confirmed the telemedicine video call'
      : 'chose to switch the appointment to in-person';

  const body = `${patientName} ${decisionText} for the appointment on ${date} at ${time}.`;
  const senderId = appointment.patient.profileId ?? adminId;

  await sendSystemMessage({
    practiceId,
    senderId,
    recipientId: adminId,
    patientId: appointment.patientId,
    appointmentId: appointment.id,
    body,
  });

  await sendSystemMessage({
    practiceId,
    senderId,
    recipientId: doctorProfile.profileId,
    patientId: appointment.patientId,
    appointmentId: appointment.id,
    body,
  });
}
