import { safeProfileRelation } from './safeProfile';

export const patientInclude = {
  profile: safeProfileRelation,
  assignedDoctor: { include: { profile: safeProfileRelation } },
  portalInvitations: {
    orderBy: { createdAt: 'desc' as const },
    take: 5,
    select: { createdAt: true, usedAt: true, revokedAt: true },
  },
} as const;

export const doctorInclude = {
  profile: safeProfileRelation,
} as const;

export const appointmentInclude = {
  patient: { include: { profile: safeProfileRelation } },
  doctor: { include: { profile: safeProfileRelation } },
  medicalRecords: { where: { softDeletedAt: null }, select: { id: true, parentRecordId: true, isDraft: true } },
} as const;

export const medicalRecordInclude = {
  patient: { include: { profile: safeProfileRelation } },
  doctor: { include: { profile: safeProfileRelation } },
  prescriptions: true,
  referrals: true,
  amendments: true,
  appointment: true,
  checkUps: {
    where: { softDeletedAt: null },
    include: {
      doctor: { include: { profile: safeProfileRelation } },
      appointment: true,
    },
    orderBy: { recordDate: 'desc' as const },
  },
} as const;

export const paymentInclude = {
  patient: { include: { profile: safeProfileRelation } },
  appointment: true,
} as const;

export const messageInclude = {
  sender: safeProfileRelation,
  recipient: safeProfileRelation,
  patient: { include: { profile: safeProfileRelation } },
} as const;

export const auditInclude = {
  actor: safeProfileRelation,
} as const;
