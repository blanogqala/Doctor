import { UserRole } from '@prisma/client';
import { toSafeProfile } from './safeProfile';

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
  profileId: string;
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
  profile?: Parameters<typeof toSafeProfile>[0];
  assignedDoctor?: DoctorLike;
} | null;

function toDoctorSummary(doctor: DoctorLike) {
  if (!doctor) return null;
  return {
    ...doctor,
    profile: toSafeProfile(doctor.profile),
  };
}

function basePatientDto(patient: PatientLike) {
  if (!patient) return null;
  return {
    id: patient.id,
    profileId: patient.profileId,
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
