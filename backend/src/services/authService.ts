import bcrypt from 'bcryptjs';
import { PatientPortalStatus, PatientRegistrationSource, UserRole } from '@prisma/client';
import { prisma } from '../config/database';
import { toSnakeCase } from '../utils/serialize';
import { toSafeProfile } from '../utils/safeProfile';
import { AppError } from '../middleware/errorHandler';
import { validatePassword } from '../utils/passwordPolicy';
import { assertActiveDoctorInPractice } from './activeDoctor';
import { revokeAllPracticeSessionsForProfile } from './sessionService';
import { splitFullName } from '../utils/personName';
import { assertPatientEmailAvailable } from './patientEmailUniqueness';
import { createReceptionPatient } from './receptionPatientService';
import {
  derivePracticeAccess,
  serializePracticeAccessForRole,
} from './practiceAccessPolicy';

const profileInclude = {
  doctor: true,
  patient: true,
  practice: true,
} as const;

export async function buildAuthUser(profileId: string) {
  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    include: profileInclude,
  });

  if (!profile || profile.softDeletedAt) {
    return null;
  }

  return toSnakeCase({
    id: profile.id,
    email: profile.email,
    role: profile.role,
    practiceId: profile.practiceId,
    practice: profile.practice
      ? {
          id: profile.practice.id,
          subdomain: profile.practice.subdomain,
          clinicName: profile.practice.clinicName,
          logoUrl: profile.practice.logoUrl,
          brandColor: profile.practice.brandColor,
          subscriptionStatus: profile.practice.subscriptionStatus,
          trialEndsAt: profile.practice.trialEndsAt,
          subscriptionEndsAt: profile.practice.subscriptionEndsAt,
          access: serializePracticeAccessForRole(
            derivePracticeAccess(profile.practice),
            profile.role
          ),
          clinicalChartAccessMode: profile.practice.clinicalChartAccessMode,
        }
      : null,
    isPracticeOwner: Boolean(
      profile.practice && profile.practice.ownerProfileId === profile.id
    ),
    profile: toSafeProfile(profile),
    doctor: profile.doctor,
    patient: profile.patient,
  });
}

export async function login(email: string, password: string, practiceId: string) {
  const profile = await prisma.profile.findUnique({
    where: { practiceId_email: { practiceId, email } },
    include: profileInclude,
  });

  if (!profile || profile.softDeletedAt) {
    throw new AppError(401, 'Invalid credentials');
  }

  if (!profile.isActive) {
    if (profile.role === UserRole.PATIENT && !profile.activatedAt) {
      throw new AppError(403, 'Account pending activation. Check your email for the activation link.');
    }
    throw new AppError(403, 'Account is deactivated');
  }

  if (profile.lockedUntil && profile.lockedUntil > new Date()) {
    throw new AppError(403, 'Account temporarily locked. Try again later.');
  }

  const valid = await bcrypt.compare(password, profile.passwordHash);
  if (!valid) {
    const attempts = profile.failedLoginAttempts + 1;
    await prisma.profile.update({
      where: { id: profile.id },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil: attempts >= 5 ? new Date(Date.now() + 30 * 60 * 1000) : null,
      },
    });
    throw new AppError(401, 'Invalid credentials');
  }

  await prisma.profile.update({
    where: { id: profile.id },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    },
  });

  const user = await buildAuthUser(profile.id);
  return {
    user,
    profileId: profile.id,
    practiceId: profile.practiceId,
  };
}

export async function register(data: {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  practiceId: string;
  role?: UserRole;
  patient?: Record<string, unknown>;
  doctor?: Record<string, unknown>;
}) {
  // Public registration is PATIENT-only
  const role = data.role ?? UserRole.PATIENT;
  if (role !== UserRole.PATIENT) {
    throw new AppError(403, 'Only patient self-registration is allowed');
  }

  await assertPatientEmailAvailable(prisma, {
    practiceId: data.practiceId,
    email: data.email,
  });

  const passwordHash = await bcrypt.hash(data.password, 10);
  const practice = await prisma.practice.findUnique({ where: { id: data.practiceId } });
  if (!practice || practice.softDeletedAt) {
    throw new AppError(404, 'Practice not found');
  }

  const assignedDoctorId = (data.patient?.assigned_doctor_id as string) ?? null;
  if (assignedDoctorId) {
    await assertActiveDoctorInPractice(prisma, assignedDoctorId, data.practiceId, {
      inactiveMessage: 'This Doctor is inactive and cannot receive new patient assignments.',
    });
  }
  const names = splitFullName(data.fullName);

  const profile = await prisma.profile.create({
    data: {
      practiceId: data.practiceId,
      email: data.email,
      fullName: data.fullName,
      phone: data.phone ?? null,
      role: UserRole.PATIENT,
      passwordHash,
      isActive: true,
      activatedAt: new Date(),
      patient: {
        create: {
          practiceId: data.practiceId,
          firstName: names.firstName,
          lastName: names.lastName,
          email: data.email,
          phone: data.phone ?? null,
          registrationSource: PatientRegistrationSource.SELF_REGISTERED,
          portalStatus: PatientPortalStatus.ACTIVE,
          idNumber: (data.patient?.id_number as string) ?? null,
          idNumberLast4: data.patient?.id_number
            ? String(data.patient.id_number).slice(-4)
            : null,
          dateOfBirth: data.patient?.date_of_birth
            ? new Date(String(data.patient.date_of_birth))
            : null,
          gender: (data.patient?.gender as never) ?? 'UNKNOWN',
          address: (data.patient?.address as string) ?? null,
          city: (data.patient?.city as string) ?? null,
          province: (data.patient?.province as string) ?? 'Eastern Cape',
          medicalAidProvider: (data.patient?.medical_aid_provider as string) ?? null,
          medicalAidNumber: (data.patient?.medical_aid_number as string) ?? null,
          emergencyContactName: (data.patient?.emergency_contact_name as string) ?? null,
          emergencyContactPhone: (data.patient?.emergency_contact_phone as string) ?? null,
          assignedDoctorId,
        },
      },
    },
    include: profileInclude,
  });

  const user = await buildAuthUser(profile.id);
  return {
    user,
    profileId: profile.id,
    practiceId: profile.practiceId,
  };
}

export async function adminCreatePatient(
  data: {
    email?: string;
    fullName: string;
    phone?: string;
    patient: Record<string, unknown>;
  },
  practiceId: string,
  actorId: string
) {
  const names = splitFullName(data.fullName);
  const created = await createReceptionPatient(
    {
      firstName: names.firstName,
      lastName: names.lastName,
      email: data.email ?? null,
      phone: data.phone ?? null,
      patient: data.patient,
    },
    practiceId,
    actorId
  );
  return created;
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
) {
  const profile = await prisma.profile.findUnique({ where: { id: userId } });
  if (!profile || profile.softDeletedAt) {
    throw new AppError(401, 'User not found');
  }

  const valid = await bcrypt.compare(currentPassword, profile.passwordHash);
  if (!valid) {
    throw new AppError(401, 'Current password is incorrect');
  }

  const passwordCheck = validatePassword(newPassword);
  if (!passwordCheck.ok) {
    throw new AppError(400, passwordCheck.error);
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.profile.update({
    where: { id: userId },
    data: { passwordHash },
  });

  await revokeAllPracticeSessionsForProfile(userId);

  return { success: true };
}
