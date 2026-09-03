import bcrypt from 'bcryptjs';
import {
  PracticeInvitation,
  Prisma,
  SubscriptionStatus,
  UserRole,
} from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { generateSecureToken, hashToken } from '../utils/secureToken';
import { validatePassword } from '../utils/passwordPolicy';
import { logAudit } from './auditService';
import { pilotEndFromStart } from './pilotProgramService';
import {
  assertDoctorSeatAvailable,
  lockPracticeRow,
} from './seatService';

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';

export function invitationStatus(
  invitation: Pick<PracticeInvitation, 'acceptedAt' | 'revokedAt' | 'expiresAt'>,
  now = new Date()
): InvitationStatus {
  if (invitation.acceptedAt) return 'ACCEPTED';
  if (invitation.revokedAt) return 'REVOKED';
  if (invitation.expiresAt <= now) return 'EXPIRED';
  return 'PENDING';
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface CreateInvitationInput {
  practiceId: string;
  email: string;
  fullName: string;
  role: UserRole;
  hpcsaNumber?: string | null;
  isPracticeOwner?: boolean;
  invitedByProfileId?: string | null;
  invitedBySuperAdminId?: string | null;
}

export async function createInvitation(
  input: CreateInvitationInput,
  client?: Prisma.TransactionClient
) {
  if (input.role !== UserRole.DOCTOR && input.role !== UserRole.ADMIN) {
    throw new AppError(400, 'Invitations may only be sent for Doctor or Reception roles');
  }
  if (input.isPracticeOwner && input.role !== UserRole.DOCTOR) {
    throw new AppError(400, 'Practice Owner must be a Doctor');
  }

  const email = normalizeEmail(input.email);
  const token = generateSecureToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

  const run = async (tx: Prisma.TransactionClient) => {
    await lockPracticeRow(tx, input.practiceId);

    const practice = await tx.practice.findFirst({
      where: { id: input.practiceId, softDeletedAt: null },
    });
    if (!practice) throw new AppError(404, 'Practice not found');
    if (practice.subscriptionStatus === SubscriptionStatus.CANCELLED) {
      throw new AppError(409, 'Cannot invite users to a cancelled Practice', 'PRACTICE_CANCELLED');
    }

    const existingProfile = await tx.profile.findUnique({
      where: { practiceId_email: { practiceId: input.practiceId, email } },
    });
    if (existingProfile && !existingProfile.softDeletedAt) {
      throw new AppError(409, 'An account with this email already exists in this Practice');
    }

    const now = new Date();
    const duplicate = await tx.practiceInvitation.findFirst({
      where: {
        practiceId: input.practiceId,
        email,
        role: input.role,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
    });
    if (duplicate) {
      throw new AppError(409, 'An active invitation already exists for this email and role');
    }

    if (input.role === UserRole.DOCTOR) {
      await assertDoctorSeatAvailable(tx, input.practiceId);
    }

    return tx.practiceInvitation.create({
      data: {
        practiceId: input.practiceId,
        email,
        fullName: input.fullName.trim(),
        role: input.role,
        hpcsaNumber: input.hpcsaNumber?.trim() || null,
        isPracticeOwner: Boolean(input.isPracticeOwner),
        tokenHash,
        expiresAt,
        invitedByProfileId: input.invitedByProfileId ?? null,
        invitedBySuperAdminId: input.invitedBySuperAdminId ?? null,
      },
    });
  };

  const invitation = client
    ? await run(client)
    : await prisma.$transaction(async (tx) => run(tx));

  return { invitation, token };
}

export async function resendInvitation(invitationId: string, practiceId?: string) {
  const token = generateSecureToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

  const invitation = await prisma.$transaction(async (tx) => {
    const existing = await tx.practiceInvitation.findFirst({
      where: {
        id: invitationId,
        ...(practiceId ? { practiceId } : {}),
      },
    });
    if (!existing) throw new AppError(404, 'Invitation not found');
    if (existing.acceptedAt) throw new AppError(409, 'Invitation already accepted');
    if (existing.revokedAt) throw new AppError(409, 'Invitation has been revoked');

    await lockPracticeRow(tx, existing.practiceId);

    if (existing.role === UserRole.DOCTOR && existing.expiresAt <= new Date()) {
      await assertDoctorSeatAvailable(tx, existing.practiceId, {
        excludeInvitationId: existing.id,
      });
    }

    return tx.practiceInvitation.update({
      where: { id: existing.id },
      data: { tokenHash, expiresAt },
    });
  });

  return { invitation, token };
}

export async function revokeInvitation(invitationId: string, practiceId?: string) {
  const existing = await prisma.practiceInvitation.findFirst({
    where: {
      id: invitationId,
      ...(practiceId ? { practiceId } : {}),
    },
  });
  if (!existing) throw new AppError(404, 'Invitation not found');
  if (existing.acceptedAt) throw new AppError(409, 'Invitation already accepted');
  if (existing.revokedAt) return existing;

  return prisma.practiceInvitation.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });
}

export async function findInvitationByToken(token: string) {
  if (!token || token.length < 16) return null;
  const tokenHash = hashToken(token);
  return prisma.practiceInvitation.findUnique({
    where: { tokenHash },
    include: {
      practice: {
        select: {
          id: true,
          clinicName: true,
          subdomain: true,
          subscriptionStatus: true,
          doctorSeatLimit: true,
          ownerProfileId: true,
          softDeletedAt: true,
        },
      },
    },
  });
}

export async function validateInvitationToken(token: string) {
  const invitation = await findInvitationByToken(token);
  if (!invitation || invitation.practice.softDeletedAt) {
    throw new AppError(404, 'Invitation not found', 'INVITATION_INVALID');
  }
  const status = invitationStatus(invitation);
  if (status === 'ACCEPTED') throw new AppError(409, 'Invitation already accepted', 'INVITATION_ACCEPTED');
  if (status === 'REVOKED') throw new AppError(409, 'Invitation has been revoked', 'INVITATION_REVOKED');
  if (status === 'EXPIRED') throw new AppError(410, 'Invitation has expired', 'INVITATION_EXPIRED');
  if (invitation.practice.subscriptionStatus === SubscriptionStatus.CANCELLED) {
    throw new AppError(409, 'This Practice is cancelled', 'PRACTICE_CANCELLED');
  }
  return invitation;
}

export async function acceptInvitation(token: string, password: string) {
  const passwordCheck = validatePassword(password);
  if (!passwordCheck.ok) throw new AppError(400, passwordCheck.error);

  const tokenHash = hashToken(token);
  const passwordHash = await bcrypt.hash(password, 10);

  const result = await prisma.$transaction(async (tx) => {
    const invitation = await tx.practiceInvitation.findUnique({
      where: { tokenHash },
    });
    if (!invitation) throw new AppError(404, 'Invitation not found', 'INVITATION_INVALID');

    await lockPracticeRow(tx, invitation.practiceId);

    const practice = await tx.practice.findFirst({
      where: { id: invitation.practiceId, softDeletedAt: null },
    });
    if (!practice) throw new AppError(404, 'Practice not found');
    if (practice.subscriptionStatus === SubscriptionStatus.CANCELLED) {
      throw new AppError(409, 'This Practice is cancelled', 'PRACTICE_CANCELLED');
    }

    const status = invitationStatus(invitation);
    if (status === 'ACCEPTED') throw new AppError(409, 'Invitation already accepted', 'INVITATION_ACCEPTED');
    if (status === 'REVOKED') throw new AppError(409, 'Invitation has been revoked', 'INVITATION_REVOKED');
    if (status === 'EXPIRED') throw new AppError(410, 'Invitation has expired', 'INVITATION_EXPIRED');

    if (invitation.role === UserRole.DOCTOR) {
      await assertDoctorSeatAvailable(tx, invitation.practiceId, {
        excludeInvitationId: invitation.id,
      });
    }

    const existingProfile = await tx.profile.findUnique({
      where: {
        practiceId_email: { practiceId: invitation.practiceId, email: invitation.email },
      },
    });
    if (existingProfile && !existingProfile.softDeletedAt) {
      throw new AppError(409, 'An account with this email already exists in this Practice');
    }

    if (invitation.role === UserRole.DOCTOR && invitation.hpcsaNumber) {
      const hpcsaTaken = await tx.doctor.findFirst({
        where: { hpcsaRegistrationNumber: invitation.hpcsaNumber },
      });
      if (hpcsaTaken) {
        throw new AppError(409, 'This HPCSA number is already registered');
      }
    }

    const profile = await tx.profile.create({
      data: {
        practiceId: invitation.practiceId,
        email: invitation.email,
        fullName: invitation.fullName,
        role: invitation.role,
        passwordHash,
        isActive: true,
        activatedAt: new Date(),
        ...(invitation.role === UserRole.DOCTOR
          ? {
              doctor: {
                create: {
                  practiceId: invitation.practiceId,
                  hpcsaRegistrationNumber: invitation.hpcsaNumber,
                  practiceName: practice.clinicName,
                  isVerified: false,
                },
              },
            }
          : {}),
      },
      include: { doctor: true },
    });

    let pilotStarted = false;
    let pilotStartsAt: Date | null = null;
    let pilotEndsAt: Date | null = null;

    if (invitation.isPracticeOwner) {
      if (practice.ownerProfileId) {
        throw new AppError(409, 'This Practice already has an owner');
      }

      const pendingPilot =
        Boolean(practice.pilotProgramGrantedAt) && !practice.pilotProgramStartsAt;

      if (pendingPilot) {
        const activationNow = new Date();
        pilotStartsAt = activationNow;
        pilotEndsAt = pilotEndFromStart(activationNow, activationNow);
        await tx.practice.update({
          where: { id: practice.id },
          data: {
            ownerProfileId: profile.id,
            pilotProgramStartsAt: pilotStartsAt,
            pilotProgramEndsAt: pilotEndsAt,
            trialEndsAt: pilotEndsAt,
          },
        });
        pilotStarted = true;
      } else {
        await tx.practice.update({
          where: { id: practice.id },
          data: { ownerProfileId: profile.id },
        });
      }
    }

    await tx.practiceInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });

    return { profile, practice, invitation, pilotStarted, pilotStartsAt, pilotEndsAt };
  });

  await logAudit({
    practiceId: result.practice.id,
    actorId: result.profile.id,
    action: result.invitation.isPracticeOwner ? 'OWNER_ACTIVATED' : 'TEAM_MEMBER_ACTIVATED',
    resource: 'INVITATION',
    resourceId: result.invitation.id,
    newValue: {
      email: result.invitation.email,
      role: result.invitation.role,
      isPracticeOwner: result.invitation.isPracticeOwner,
    },
  });

  if (result.pilotStarted && result.pilotStartsAt && result.pilotEndsAt) {
    await logAudit({
      practiceId: result.practice.id,
      actorId: result.profile.id,
      action: 'PILOT_ACCESS_STARTED',
      resource: 'PRACTICE',
      resourceId: result.practice.id,
      newValue: {
        startsAt: result.pilotStartsAt.toISOString(),
        endsAt: result.pilotEndsAt.toISOString(),
        durationDays: 30,
      },
    });
  }

  return result;
}

export function serializeInvitation(
  invitation: PracticeInvitation & {
    invitedByProfile?: { fullName: string; email: string } | null;
    invitedBySuperAdmin?: { name: string; email: string } | null;
  }
) {
  return {
    id: invitation.id,
    practiceId: invitation.practiceId,
    email: invitation.email,
    fullName: invitation.fullName,
    role: invitation.role,
    hpcsaNumber: invitation.hpcsaNumber,
    isPracticeOwner: invitation.isPracticeOwner,
    status: invitationStatus(invitation),
    expiresAt: invitation.expiresAt,
    acceptedAt: invitation.acceptedAt,
    revokedAt: invitation.revokedAt,
    invitedByProfileId: invitation.invitedByProfileId,
    invitedBySuperAdminId: invitation.invitedBySuperAdminId,
    invitedByProfile: invitation.invitedByProfile ?? null,
    invitedBySuperAdmin: invitation.invitedBySuperAdmin ?? null,
    createdAt: invitation.createdAt,
    updatedAt: invitation.updatedAt,
  };
}
