import bcrypt from 'bcryptjs';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { generateSecureToken, hashToken } from '../utils/secureToken';
import { validatePassword } from '../utils/passwordPolicy';
import { logAudit } from './auditService';

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const GENERIC_SUCCESS = {
  success: true,
  message: 'If an account exists for that email, a reset link has been sent.',
};

export async function requestPasswordReset(practiceId: string, email: string) {
  const normalized = email.trim().toLowerCase();
  const profile = await prisma.profile.findFirst({
    where: {
      practiceId,
      email: normalized,
      isActive: true,
      softDeletedAt: null,
    },
    include: { practice: { select: { clinicName: true, subdomain: true } } },
  });

  if (!profile) {
    return { ...GENERIC_SUCCESS, sent: false as const };
  }

  await prisma.passwordResetToken.updateMany({
    where: { profileId: profile.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = generateSecureToken();
  await prisma.passwordResetToken.create({
    data: {
      profileId: profile.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
    },
  });

  return {
    ...GENERIC_SUCCESS,
    sent: true as const,
    token,
    email: profile.email,
    fullName: profile.fullName,
    subdomain: profile.practice.subdomain,
    clinicName: profile.practice.clinicName,
  };
}

export async function resetPasswordWithToken(token: string, password: string) {
  const passwordCheck = validatePassword(password);
  if (!passwordCheck.ok) throw new AppError(400, passwordCheck.error);

  const tokenHash = hashToken(token);
  const passwordHash = await bcrypt.hash(password, 10);

  const record = await prisma.$transaction(async (tx) => {
    const reset = await tx.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { profile: true },
    });
    if (!reset || reset.usedAt || reset.expiresAt <= new Date()) {
      throw new AppError(400, 'Reset link is invalid or has expired');
    }
    if (!reset.profile.isActive || reset.profile.softDeletedAt) {
      throw new AppError(400, 'Reset link is invalid or has expired');
    }

    await tx.passwordResetToken.update({
      where: { id: reset.id },
      data: { usedAt: new Date() },
    });
    await tx.passwordResetToken.updateMany({
      where: { profileId: reset.profileId, usedAt: null, id: { not: reset.id } },
      data: { usedAt: new Date() },
    });
    await tx.profile.update({
      where: { id: reset.profileId },
      data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
    });
    await tx.practiceSession.updateMany({
      where: { profileId: reset.profileId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return reset;
  });

  await logAudit({
    practiceId: record.profile.practiceId,
    actorId: record.profileId,
    action: 'PASSWORD_RESET',
    resource: 'USER',
    resourceId: record.profileId,
  });

  return { success: true };
}
