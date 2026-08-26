import { UserRole } from '@prisma/client';

export interface OnboardingChecklist {
  practiceCreated: boolean;
  ownerInvited: boolean;
  ownerActivated: boolean;
  receptionActive: boolean;
  doctorActive: boolean;
}

export function buildOnboardingChecklist(input: {
  ownerProfileId: string | null;
  ownerInvitationExists: boolean;
  activeReceptionCount: number;
  activeDoctorCount: number;
}): OnboardingChecklist {
  return {
    practiceCreated: true,
    ownerInvited: Boolean(input.ownerProfileId) || input.ownerInvitationExists,
    ownerActivated: Boolean(input.ownerProfileId),
    receptionActive: input.activeReceptionCount > 0,
    doctorActive: input.activeDoctorCount > 0,
  };
}

export const ONBOARDING_STAFF_ROLES = [UserRole.DOCTOR, UserRole.ADMIN] as const;
