import { Prisma, UserRole } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';

/** Prisma where fragment: active, non-deleted Doctor Profile. */
export const activeDoctorProfileWhere = {
  role: UserRole.DOCTOR,
  isActive: true,
  softDeletedAt: null,
} as const;

/** Filter doctors to those with an active, non-deleted Profile. */
export function activeDoctorWhere(practiceId?: string): Prisma.DoctorWhereInput {
  return {
    ...(practiceId ? { practiceId } : {}),
    profile: { ...activeDoctorProfileWhere },
  };
}

/**
 * Assert a Doctor exists in the Practice and is active (not deactivated / soft-deleted).
 * Historical appointments may still reference inactive Doctors — do not use this for reads of past data.
 */
export async function assertActiveDoctorInPractice(
  client: Prisma.TransactionClient | { doctor: { findFirst: Function } },
  doctorId: string,
  practiceId: string,
  options?: { inactiveMessage?: string }
) {
  const inactiveMessage =
    options?.inactiveMessage ??
    'This Doctor is inactive and cannot be assigned to a new appointment.';

  const doctor = await (client as Prisma.TransactionClient).doctor.findFirst({
    where: {
      id: doctorId,
      practiceId,
      profile: { ...activeDoctorProfileWhere },
    },
    include: {
      profile: { select: { id: true, fullName: true, isActive: true, softDeletedAt: true } },
    },
  });

  if (!doctor) {
    const exists = await (client as Prisma.TransactionClient).doctor.findFirst({
      where: { id: doctorId, practiceId },
      include: { profile: { select: { isActive: true, softDeletedAt: true } } },
    });
    if (exists) {
      throw new AppError(400, inactiveMessage);
    }
    throw new AppError(400, 'Invalid doctor for this practice');
  }

  return doctor;
}
