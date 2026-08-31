import { UserRole } from '@prisma/client';
import { toSafeProfile } from './safeProfile';
import { joinPersonName } from './personName';

type DoctorLike = {
  id: string;
  profileId: string;
  hpcsaRegistrationNumber: string | null;
  practiceName: string;
  specialization: string;
  isVerified: boolean;
  consultationFeeCents: number;
  telemedicineFeeCents?: number | null;
  bio: string | null;
  photoUrl?: string | null;
  credentials?: unknown;
  createdAt?: Date;
  updatedAt?: Date;
  profile?: Parameters<typeof toSafeProfile>[0];
} | null;

type PatientLike = {
  id: string;
  profileId: string | null;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  registrationSource?: string;
  portalStatus?: string;
  idNumber: string | null;
  idNumberLast4: string | null;
  dateOfBirth: Date | null;
  gender: string;
  address: string | null;
  city: string | null;
  province: string | null;
  medicalAidProvider: string | null;
  medicalAidNumber: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  assignedDoctorId: string | null;
  consentTelemedicine?: boolean;
  medicalHistory?: string | null;
  allergies?: string | null;
  currentMedications?: string | null;
  softDeletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  profile?: Parameters<typeof toSafeProfile>[0] | null;
  assignedDoctor?: DoctorLike;
  portalInvitations?: Array<{ createdAt: Date; usedAt: Date | null; revokedAt: Date | null }>;
} | null;

function toDoctorSummary(doctor: DoctorLike) {
  if (!doctor) return null;
  return {
    ...doctor,
    profile: toSafeProfile(doctor.profile),
  };
}

function latestInviteAt(patient: NonNullable<PatientLike>): Date | null {
  const invites = patient.portalInvitations;
  if (!invites?.length) return null;
  const open = invites.filter((i) => !i.usedAt && !i.revokedAt);
  const pool = open.length ? open : invites;
  return pool.reduce<Date | null>((latest, invite) => {
    if (!latest || invite.createdAt > latest) return invite.createdAt;
    return latest;
  }, null);
}

function basePatientDto(patient: PatientLike) {
  if (!patient) return null;
  const firstName = patient.firstName ?? '';
  const lastName = patient.lastName ?? '';
  return {
    id: patient.id,
    profileId: patient.profileId,
    firstName,
    lastName,
    email: patient.email ?? patient.profile?.email ?? null,
    phone: patient.phone ?? patient.profile?.phone ?? null,
    registrationSource: patient.registrationSource ?? 'SELF_REGISTERED',
    portalStatus: patient.portalStatus ?? 'ACTIVE',
    portalInvitationSentAt: latestInviteAt(patient),
    idNumber: patient.idNumber,
    idNumberLast4: patient.idNumberLast4,
    dateOfBirth: patient.dateOfBirth,
    gender: patient.gender,
    address: patient.address,
    city: patient.city,
    province: patient.province,
    medicalAidProvider: patient.medicalAidProvider,
    medicalAidNumber: patient.medicalAidNumber,
    emergencyContactName: patient.emergencyContactName,
    emergencyContactPhone: patient.emergencyContactPhone,
    assignedDoctorId: patient.assignedDoctorId,
    softDeletedAt: patient.softDeletedAt,
    createdAt: patient.createdAt,
    updatedAt: patient.updatedAt,
    profile: toSafeProfile(patient.profile),
    assignedDoctor: toDoctorSummary(patient.assignedDoctor ?? null),
    fullName: joinPersonName(firstName, lastName) || patient.profile?.fullName || '',
  };
}

export function toReceptionPatientDto(patient: PatientLike) {
  return basePatientDto(patient);
}

export function toDoctorPatientDto(patient: PatientLike) {
  const base = basePatientDto(patient);
  if (!base || !patient) return base;
  return {
    ...base,
    consentTelemedicine: patient.consentTelemedicine ?? false,
    medicalHistory: patient.medicalHistory ?? null,
    allergies: patient.allergies ?? null,
    currentMedications: patient.currentMedications ?? null,
  };
}

export function toPatientSelfDto(patient: PatientLike) {
  return toDoctorPatientDto(patient);
}

export function toRoleScopedPatientDto(role: UserRole, patient: PatientLike) {
  if (role === UserRole.ADMIN) {
    return toReceptionPatientDto(patient);
  }
  if (role === UserRole.PATIENT) {
    return toPatientSelfDto(patient);
  }
  return toDoctorPatientDto(patient);
}

export function toRoleScopedAppointmentDto<T extends { patient?: PatientLike | null }>(
  role: UserRole,
  appointment: T
): T {
  if (!appointment.patient) return appointment;
  return {
    ...appointment,
    patient: toRoleScopedPatientDto(role, appointment.patient),
  };
}

export function toRoleScopedPaymentDto<T extends { patient?: PatientLike | null }>(
  role: UserRole,
  payment: T
): T {
  if (!payment.patient) return payment;
  return {
    ...payment,
    patient: toRoleScopedPatientDto(role, payment.patient),
  };
}

export function toRoleScopedMessageDto<
  T extends { patient?: PatientLike | null }
>(role: UserRole, message: T): T {
  if (!message.patient) return message;
  return {
    ...message,
    patient: toRoleScopedPatientDto(role, message.patient),
  };
}
