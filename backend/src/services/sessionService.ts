import { prisma } from '../config/database';
import { generateSecureToken, hashToken } from '../utils/secureToken';
import {
  PLATFORM_SESSION_TTL_MS,
  PRACTICE_SESSION_TTL_MS,
} from '../utils/cookies';

export async function createPracticeSession(params: {
  profileId: string;
  practiceId: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}) {
  const rawToken = generateSecureToken();
  const csrfToken = generateSecureToken();
  const session = await prisma.practiceSession.create({
    data: {
      profileId: params.profileId,
      practiceId: params.practiceId,
      tokenHash: hashToken(rawToken),
      csrfTokenHash: hashToken(csrfToken),
      expiresAt: new Date(Date.now() + PRACTICE_SESSION_TTL_MS),
      userAgent: params.userAgent ?? null,
      ipAddress: params.ipAddress ?? null,
      lastUsedAt: new Date(),
    },
  });

  return { session, rawToken, csrfToken };
}

export async function createPlatformSession(params: {
  superAdminId: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}) {
  const rawToken = generateSecureToken();
  const csrfToken = generateSecureToken();
  const session = await prisma.platformSession.create({
    data: {
      superAdminId: params.superAdminId,
      tokenHash: hashToken(rawToken),
      csrfTokenHash: hashToken(csrfToken),
      expiresAt: new Date(Date.now() + PLATFORM_SESSION_TTL_MS),
      userAgent: params.userAgent ?? null,
      ipAddress: params.ipAddress ?? null,
      lastUsedAt: new Date(),
    },
  });

  return { session, rawToken, csrfToken };
}

export async function resolvePracticeSession(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const session = await prisma.practiceSession.findUnique({
    where: { tokenHash },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    return null;
  }

  const profile = await prisma.profile.findFirst({
    where: {
      id: session.profileId,
      practiceId: session.practiceId,
    },
    select: {
      id: true,
      role: true,
      practiceId: true,
      isActive: true,
      softDeletedAt: true,
    },
  });

  if (!profile || profile.softDeletedAt || !profile.isActive) {
    return null;
  }

  // Touch lastUsedAt without blocking the request path on failure.
  void prisma.practiceSession
    .update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => undefined);

  return { session, profile };
}

export async function resolvePlatformSession(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const session = await prisma.platformSession.findUnique({
    where: { tokenHash },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    return null;
  }

  const admin = await prisma.superAdmin.findUnique({
    where: { id: session.superAdminId },
    select: { id: true, email: true },
  });
  if (!admin) return null;

  void prisma.platformSession
    .update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => undefined);

  return { session, admin };
}

export async function revokePracticeSessionByRawToken(rawToken: string | null | undefined) {
  if (!rawToken) return;
  await prisma.practiceSession.updateMany({
    where: { tokenHash: hashToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokePlatformSessionByRawToken(rawToken: string | null | undefined) {
  if (!rawToken) return;
  await prisma.platformSession.updateMany({
    where: { tokenHash: hashToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllPracticeSessionsForProfile(profileId: string) {
  await prisma.practiceSession.updateMany({
    where: { profileId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function verifyCsrfToken(sessionCsrfHash: string, providedToken: string | undefined | null) {
  if (!providedToken) return false;
  return hashToken(providedToken) === sessionCsrfHash;
}
