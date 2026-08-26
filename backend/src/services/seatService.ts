import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';

export type DbClient = Prisma.TransactionClient | typeof prisma;

export interface SeatUsage {
  limit: number;
  active: number;
  pending: number;
  allocated: number;
  available: number;
}

export async function lockPracticeRow(tx: Prisma.TransactionClient, practiceId: string) {
  await tx.$queryRaw`SELECT id FROM practices WHERE id = ${practiceId}::uuid FOR UPDATE`;
}

export async function countActiveDoctors(db: DbClient, practiceId: string): Promise<number> {
  return db.profile.count({
    where: {
      practiceId,
      role: UserRole.DOCTOR,
      isActive: true,
      softDeletedAt: null,
    },
  });
}

export async function countPendingDoctorInvitations(
  db: DbClient,
  practiceId: string,
  options?: { excludeInvitationId?: string }
): Promise<number> {
  const now = new Date();
  return db.practiceInvitation.count({
    where: {
      practiceId,
      role: UserRole.DOCTOR,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
      ...(options?.excludeInvitationId ? { id: { not: options.excludeInvitationId } } : {}),
    },
  });
}

export async function getSeatUsage(
  db: DbClient,
  practiceId: string,
  options?: { excludeInvitationId?: string; doctorSeatLimit?: number }
): Promise<SeatUsage> {
  let limit = options?.doctorSeatLimit;
  if (limit == null) {
    const practice = await db.practice.findUnique({
      where: { id: practiceId },
      select: { doctorSeatLimit: true },
    });
    if (!practice) throw new AppError(404, 'Practice not found');
    limit = practice.doctorSeatLimit;
  }

  const [active, pending] = await Promise.all([
    countActiveDoctors(db, practiceId),
    countPendingDoctorInvitations(db, practiceId, options),
  ]);
  const allocated = active + pending;
  return {
    limit,
    active,
    pending,
    allocated,
    available: Math.max(0, limit - allocated),
  };
}

export async function assertDoctorSeatAvailable(
  db: DbClient,
  practiceId: string,
  options?: { excludeInvitationId?: string; doctorSeatLimit?: number }
): Promise<SeatUsage> {
  const usage = await getSeatUsage(db, practiceId, options);
  if (usage.allocated >= usage.limit) {
    throw new AppError(
      409,
      `Doctor seat limit reached (${usage.allocated} of ${usage.limit} allocated)`,
      'DOCTOR_SEAT_LIMIT'
    );
  }
  return usage;
}

export async function assertSeatLimitNotBelowAllocated(
  db: DbClient,
  practiceId: string,
  newLimit: number
): Promise<SeatUsage> {
  const usage = await getSeatUsage(db, practiceId);
  if (newLimit < usage.allocated) {
    throw new AppError(
      409,
      `This Practice currently has ${usage.allocated} allocated Doctor seats. Reduce allocations before lowering the seat limit.`,
      'SEAT_LIMIT_BELOW_ALLOCATED'
    );
  }
  return usage;
}
