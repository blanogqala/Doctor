import { Prisma } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';

type EmailLookupClient = {
  profile: {
    findFirst: (args: {
      where: Prisma.ProfileWhereInput;
      select: { id: true };
    }) => Promise<{ id: string } | null>;
  };
  patient: {
    findFirst: (args: {
      where: Prisma.PatientWhereInput;
      select: { id: true };
    }) => Promise<{ id: string } | null>;
  };
};

export const EMAIL_IN_USE_MESSAGE =
  'This email is already associated with another patient or account at this practice.';

export async function assertPatientEmailAvailable(
  client: EmailLookupClient,
  params: {
    practiceId: string;
    email: string;
    excludePatientId?: string;
    excludeProfileId?: string;
  }
) {
  const email = params.email.trim();
  if (!email) return;

  const existingProfile = await client.profile.findFirst({
    where: {
      practiceId: params.practiceId,
      email,
      ...(params.excludeProfileId ? { id: { not: params.excludeProfileId } } : {}),
    },
    select: { id: true },
  });
  if (existingProfile) {
    throw new AppError(409, EMAIL_IN_USE_MESSAGE);
  }

  const existingPatient = await client.patient.findFirst({
    where: {
      practiceId: params.practiceId,
      email: { equals: email, mode: 'insensitive' },
      ...(params.excludePatientId ? { id: { not: params.excludePatientId } } : {}),
    },
    select: { id: true },
  });
  if (existingPatient) {
    throw new AppError(409, EMAIL_IN_USE_MESSAGE);
  }
}
