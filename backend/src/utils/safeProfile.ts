import { Prisma, type Profile } from '@prisma/client';

export const safeProfileSelect = Prisma.validator<Prisma.ProfileSelect>()({
  id: true,
  practiceId: true,
  fullName: true,
  email: true,
  role: true,
  phone: true,
  isActive: true,
  lastLoginAt: true,
  softDeletedAt: true,
  activatedAt: true,
  createdAt: true,
  updatedAt: true,
});

export const safeProfileRelation = {
  select: safeProfileSelect,
} as const;

export type SafeProfile = Prisma.ProfileGetPayload<{
  select: typeof safeProfileSelect;
}>;

type ProfileLike = {
  id: string;
  practiceId: string;
  fullName: string;
  email: string;
  role: Profile['role'];
  phone: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  softDeletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  activatedAt?: Date | null;
};

export function toSafeProfile(profile: ProfileLike | null | undefined): SafeProfile | null {
  if (!profile) return null;
  return {
    id: profile.id,
    practiceId: profile.practiceId,
    fullName: profile.fullName,
    email: profile.email,
    role: profile.role,
    phone: profile.phone,
    isActive: profile.isActive,
    lastLoginAt: profile.lastLoginAt,
    softDeletedAt: profile.softDeletedAt,
    activatedAt: profile.activatedAt ?? null,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}
