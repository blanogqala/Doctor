import bcrypt from 'bcryptjs';
import { PatientPortalStatus, UserRole } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { generateSecureToken, hashToken } from '../utils/secureToken';
import { validatePassword } from '../utils/passwordPolicy';
import { logAudit } from './auditService';
import { createPracticeSession } from './sessionService';
import { assertPatientActivationAllowed } from './practiceAccessPolicy';
import {
  activatePortalInvitationAndCreateSession,
  findPortalInvitationByToken,
  validatePortalInvitationToken,
} from './patientPortalInvitationService';

export const PATIENT_ACTIVATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const INVALID_LINK = 'Activation link is invalid or has expired';

async function issueActivationToken(profileId: string, practiceId: string) {
  await prisma.patientActivationToken.updateMany({
    where: { profileId, usedAt: null },
    data: { usedAt: new Date() },
  });

  const rawToken = generateSecureToken();
  const record = await prisma.patientActivationToken.create({
    data: {
      profileId,
      practiceId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + PATIENT_ACTIVATION_TTL_MS),
    },
  });

  return { rawToken, record };
}

export async function createPendingPatientActivation(params: {
  profileId: string;
  practiceId: string;
}) {
  return issueActivationToken(params.profileId, params.practiceId);
}

export async function resendPatientActivation(params: {
  practiceId: string;
  profileId: string;
  actorId: string;
}) {
  const profile = await prisma.profile.findFirst({
    where: {
      id: params.profileId,
      practiceId: params.practiceId,
      role: UserRole.PATIENT,
      softDeletedAt: null,
    },
    include: {
      practice: { select: { clinicName: true, subdomain: true } },
      patient: { select: { id: true } },
    },
  });

  if (!profile || !profile.patient) {
    throw new AppError(404, 'Patient not found');
  }

  if (profile.activatedAt && profile.isActive) {
    throw new AppError(400, 'Patient account is already activated');
  }

  const { rawToken } = await issueActivationToken(profile.id, profile.practiceId);

  await logAudit({
    practiceId: params.practiceId,
    actorId: params.actorId,
    action: 'PATIENT_ACTIVATION_RESENT',
    resource: 'USER',
    resourceId: profile.id,
  });

  return {
    token: rawToken,
    email: profile.email,
    fullName: profile.fullName,
    subdomain: profile.practice.subdomain,
    clinicName: profile.practice.clinicName,
  };
}

export async function validatePatientActivationToken(token: string) {
  const portalInvite = await findPortalInvitationByToken(token);
  if (portalInvite) {
    return validatePortalInvitationToken(token);
  }

  if (!token || token.length < 16) {
    throw new AppError(400, INVALID_LINK);
  }

  const record = await prisma.patientActivationToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      profile: {
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          isActive: true,
          activatedAt: true,
          softDeletedAt: true,
          practiceId: true,
        },
      },
      practice: {
        select: {
          id: true,
          clinicName: true,
          subdomain: true,
          subscriptionStatus: true,
          subscriptionSuspensionReason: true,
          subscriptionSuspendedAt: true,
          trialEndsAt: true,
          ownerProfileId: true,
        },
      },
    },
  });

  if (
    !record ||
    record.usedAt ||
    record.expiresAt <= new Date() ||
    !record.profile ||
    record.profile.softDeletedAt ||
    record.profile.role !== UserRole.PATIENT
  ) {
    throw new AppError(400, INVALID_LINK);
  }

  if (record.profile.activatedAt && record.profile.isActive) {
    throw new AppError(400, 'This account is already activated');
  }

  if (record.practiceId !== record.profile.practiceId) {
    throw new AppError(400, INVALID_LINK);
  }

  assertPatientActivationAllowed(record.practice);

  return {
    email: record.profile.email,
    fullName: record.profile.fullName,
    practiceName: record.practice.clinicName,
    subdomain: record.practice.subdomain,
    practiceId: record.practiceId,
    profileId: record.profileId,
    expiresAt: record.expiresAt,
  };
}

export async function acceptPatientActivation(params: {
  token: string;
  password: string;
  /** Optional tenant check from request context. */
  practiceId?: string | null;
}) {
  const passwordCheck = validatePassword(params.password);
  if (!passwordCheck.ok) throw new AppError(400, passwordCheck.error);

  const passwordHash = await bcrypt.hash(params.password, 10);
  const tokenHash = hashToken(params.token);

  const result = await prisma.$transaction(async (tx) => {
    const record = await tx.patientActivationToken.findUnique({
      where: { tokenHash },
      include: {
        profile: true,
        practice: {
          select: {
            id: true,
            subdomain: true,
            subscriptionStatus: true,
            subscriptionSuspensionReason: true,
            subscriptionSuspendedAt: true,
            trialEndsAt: true,
            ownerProfileId: true,
          },
        },
      },
    });

    if (
      !record ||
      record.usedAt ||
      record.expiresAt <= new Date() ||
      record.profile.softDeletedAt ||
      record.profile.role !== UserRole.PATIENT
    ) {
      throw new AppError(400, INVALID_LINK);
    }

    if (params.practiceId && record.practiceId !== params.practiceId) {
      throw new AppError(403, 'Activation token does not match this Practice');
    }

    assertPatientActivationAllowed(record.practice);

    if (record.profile.activatedAt && record.profile.isActive) {
      throw new AppError(400, 'This account is already activated');
    }

    await tx.patientActivationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    await tx.patientActivationToken.updateMany({
      where: { profileId: record.profileId, usedAt: null, id: { not: record.id } },
      data: { usedAt: new Date() },
    });

    const profile = await tx.profile.update({
      where: { id: record.profileId },
      data: {
        passwordHash,
        isActive: true,
        activatedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    await tx.patient.updateMany({
      where: { profileId: record.profileId, practiceId: record.practiceId },
      data: { portalStatus: PatientPortalStatus.ACTIVE },
    });

    return { profile, practice: record.practice };
  });

  await logAudit({
    practiceId: result.profile.practiceId,
    actorId: result.profile.id,
    action: 'PATIENT_ACTIVATED',
    resource: 'USER',
    resourceId: result.profile.id,
  });
  const linkedPatient = await prisma.patient.findFirst({
    where: { profileId: result.profile.id, practiceId: result.profile.practiceId },
    select: { id: true },
  });
  if (linkedPatient) {
    await logAudit({
      practiceId: result.profile.practiceId,
      actorId: result.profile.id,
      action: 'PATIENT_PORTAL_ACTIVATED',
      resource: 'PATIENT',
      resourceId: linkedPatient.id,
      patientId: linkedPatient.id,
    });
  }

  return {
    profileId: result.profile.id,
    practiceId: result.profile.practiceId,
    subdomain: result.practice.subdomain,
    email: result.profile.email,
  };
}

/** Issue a practice session after successful activation (same pattern as invite accept). */
export async function activateAndCreateSession(params: {
  token: string;
  password: string;
  practiceId?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
}) {
  const portalInvite = await findPortalInvitationByToken(params.token);
  if (portalInvite) {
    return activatePortalInvitationAndCreateSession(params);
  }

  const activated = await acceptPatientActivation(params);
  const session = await createPracticeSession({
    profileId: activated.profileId,
    practiceId: activated.practiceId,
    userAgent: params.userAgent,
    ipAddress: params.ipAddress,
  });
  return { ...activated, session };
}
