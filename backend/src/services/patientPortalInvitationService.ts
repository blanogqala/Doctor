import bcrypt from 'bcryptjs';
import { PatientPortalStatus, UserRole } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { generateSecureToken, hashToken } from '../utils/secureToken';
import { validatePassword } from '../utils/passwordPolicy';
import { joinPersonName } from '../utils/personName';
import { logAudit } from './auditService';
import { assertPatientEmailAvailable } from './patientEmailUniqueness';
import { createPracticeSession } from './sessionService';

/** Invitation lifetime — matches legacy PatientActivationToken TTL. */
export const PATIENT_PORTAL_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const INVALID_LINK = 'Activation link is invalid or has expired';
const ADD_EMAIL_MESSAGE = 'Add an email address before sending a portal invitation.';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function loadPatientForInvite(practiceId: string, patientId: string) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, practiceId, softDeletedAt: null },
    include: {
      practice: { select: { clinicName: true, subdomain: true } },
      profile: { select: { id: true, activatedAt: true, isActive: true, email: true } },
    },
  });
  if (!patient) {
    throw new AppError(404, 'Patient not found');
  }
  return patient;
}

async function issueInvitation(params: {
  practiceId: string;
  patientId: string;
  email: string;
  invitedByUserId: string;
}) {
  await prisma.patientPortalInvitation.updateMany({
    where: { patientId: params.patientId, usedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  const rawToken = generateSecureToken();
  const record = await prisma.patientPortalInvitation.create({
    data: {
      practiceId: params.practiceId,
      patientId: params.patientId,
      email: params.email,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + PATIENT_PORTAL_INVITATION_TTL_MS),
      invitedByUserId: params.invitedByUserId,
    },
  });

  await prisma.patient.update({
    where: { id: params.patientId },
    data: { portalStatus: PatientPortalStatus.INVITED, email: params.email },
  });

  return { rawToken, record };
}

export async function sendPatientPortalInvitation(params: {
  practiceId: string;
  patientId: string;
  actorId: string;
  isResend?: boolean;
}) {
  const patient = await loadPatientForInvite(params.practiceId, params.patientId);

  if (patient.portalStatus === PatientPortalStatus.ACTIVE || patient.profile?.activatedAt) {
    throw new AppError(400, 'Patient portal is already active');
  }

  const email = (patient.email ?? patient.profile?.email ?? '').trim();
  if (!email || !isValidEmail(email)) {
    throw new AppError(400, ADD_EMAIL_MESSAGE);
  }

  await assertPatientEmailAvailable(prisma, {
    practiceId: params.practiceId,
    email,
    excludePatientId: patient.id,
    excludeProfileId: patient.profileId ?? undefined,
  });

  const { rawToken, record } = await issueInvitation({
    practiceId: patient.practiceId,
    patientId: patient.id,
    email,
    invitedByUserId: params.actorId,
  });

  await logAudit({
    practiceId: params.practiceId,
    actorId: params.actorId,
    action: params.isResend ? 'PATIENT_PORTAL_INVITATION_RESENT' : 'PATIENT_PORTAL_INVITATION_SENT',
    resource: 'PATIENT',
    resourceId: patient.id,
    patientId: patient.id,
    newValue: { email, invitationId: record.id },
  });

  return {
    token: rawToken,
    email,
    fullName: joinPersonName(patient.firstName, patient.lastName),
    subdomain: patient.practice.subdomain,
    clinicName: patient.practice.clinicName,
    invitedAt: record.createdAt,
  };
}

export async function findPortalInvitationByToken(token: string) {
  if (!token || token.length < 16) return null;
  return prisma.patientPortalInvitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      patient: true,
      practice: { select: { id: true, clinicName: true, subdomain: true } },
    },
  });
}

export async function validatePortalInvitationToken(token: string) {
  const record = await findPortalInvitationByToken(token);
  if (
    !record ||
    record.usedAt ||
    record.revokedAt ||
    record.expiresAt <= new Date() ||
    record.patient.softDeletedAt
  ) {
    throw new AppError(400, INVALID_LINK);
  }
  if (record.practiceId !== record.patient.practiceId) {
    throw new AppError(400, INVALID_LINK);
  }
  if (record.patient.portalStatus === PatientPortalStatus.ACTIVE && record.patient.profileId) {
    throw new AppError(400, 'This account is already activated');
  }

  return {
    email: record.email,
    fullName: joinPersonName(record.patient.firstName, record.patient.lastName),
    practiceName: record.practice.clinicName,
    subdomain: record.practice.subdomain,
    practiceId: record.practiceId,
    patientId: record.patientId,
    expiresAt: record.expiresAt,
    kind: 'portal_invitation' as const,
  };
}

export async function acceptPortalInvitation(params: {
  token: string;
  password: string;
  practiceId?: string | null;
}) {
  const passwordCheck = validatePassword(params.password);
  if (!passwordCheck.ok) throw new AppError(400, passwordCheck.error);

  const passwordHash = await bcrypt.hash(params.password, 10);
  const tokenHash = hashToken(params.token);

  const result = await prisma.$transaction(async (tx) => {
    const record = await tx.patientPortalInvitation.findUnique({
      where: { tokenHash },
      include: { patient: true, practice: { select: { id: true, subdomain: true } } },
    });

    if (
      !record ||
      record.usedAt ||
      record.revokedAt ||
      record.expiresAt <= new Date() ||
      record.patient.softDeletedAt
    ) {
      throw new AppError(400, INVALID_LINK);
    }

    if (params.practiceId && record.practiceId !== params.practiceId) {
      throw new AppError(403, 'Activation token does not match this Practice');
    }

    if (record.patient.profileId && record.patient.portalStatus === PatientPortalStatus.ACTIVE) {
      throw new AppError(400, 'This account is already activated');
    }

    const email = record.email.trim();
    await assertPatientEmailAvailable(tx, {
      practiceId: record.practiceId,
      email,
      excludePatientId: record.patientId,
      excludeProfileId: record.patient.profileId ?? undefined,
    });

    const fullName = joinPersonName(record.patient.firstName, record.patient.lastName);
    const existingProfileId = record.patient.profileId;

    let profileId = existingProfileId;
    if (existingProfileId) {
      await tx.profile.update({
        where: { id: existingProfileId },
        data: {
          email,
          fullName,
          passwordHash,
          isActive: true,
          activatedAt: new Date(),
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
    } else {
      const profile = await tx.profile.create({
        data: {
          practiceId: record.practiceId,
          email,
          fullName,
          phone: record.patient.phone,
          role: UserRole.PATIENT,
          passwordHash,
          isActive: true,
          activatedAt: new Date(),
        },
      });
      profileId = profile.id;
    }

    await tx.patient.update({
      where: { id: record.patientId },
      data: {
        profileId,
        email,
        portalStatus: PatientPortalStatus.ACTIVE,
      },
    });

    await tx.patientPortalInvitation.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    await tx.patientPortalInvitation.updateMany({
      where: {
        patientId: record.patientId,
        usedAt: null,
        id: { not: record.id },
      },
      data: { revokedAt: new Date() },
    });

    return {
      profileId: profileId!,
      practiceId: record.practiceId,
      patientId: record.patientId,
      subdomain: record.practice.subdomain,
      email,
    };
  });

  await logAudit({
    practiceId: result.practiceId,
    actorId: result.profileId,
    action: 'PATIENT_PORTAL_ACTIVATED',
    resource: 'PATIENT',
    resourceId: result.patientId,
    patientId: result.patientId,
  });

  return result;
}

export async function activatePortalInvitationAndCreateSession(params: {
  token: string;
  password: string;
  practiceId?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
}) {
  const activated = await acceptPortalInvitation(params);
  const session = await createPracticeSession({
    profileId: activated.profileId,
    practiceId: activated.practiceId,
    userAgent: params.userAgent,
    ipAddress: params.ipAddress,
  });
  return { ...activated, session };
}

export async function latestOpenInvitation(patientId: string, practiceId: string) {
  return prisma.patientPortalInvitation.findFirst({
    where: { patientId, practiceId, usedAt: null, revokedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, expiresAt: true, email: true },
  });
}
