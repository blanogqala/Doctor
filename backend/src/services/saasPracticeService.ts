import {
  InquiryStatus,
  Prisma,
  SubscriptionInvoiceStatus,
  SubscriptionPlan,
  SubscriptionStatus,
  SubscriptionSuspensionReason,
  UserRole,
} from '@prisma/client';
import { prisma } from '../config/database';
import { resolvePlanAgreement } from '../config/subscriptionPlans';
import { AppError } from '../middleware/errorHandler';
import { isReservedSubdomain, normalizeSubdomain } from '../middleware/tenant';
import { logAudit } from './auditService';
import { sendPracticeInvitationEmail } from './emailService';
import { createInvitation, invitationStatus, serializeInvitation } from './invitationService';
import { buildOnboardingChecklist } from './onboardingStatus';
import {
  derivePracticeAccess,
  serializePracticeAccess,
} from './practiceAccessPolicy';
import { getSeatUsage, lockPracticeRow } from './seatService';
import { updateInquiryStatus } from './inquiryService';
import {
  compactPilotProgramIndicator,
  pilotEndFromStart,
  serializePilotProgram,
  standardTrialEndsAt,
} from './pilotProgramService';

const SAAS_AUDIT_ACTIONS = new Set([
  'PRACTICE_CREATED',
  'PRACTICE_ONBOARDED',
  'OWNER_INVITATION_SENT',
  'INVITATION_RESENT',
  'INVITATION_REVOKED',
  'OWNER_ACTIVATED',
  'TEAM_MEMBER_INVITED',
  'TEAM_MEMBER_ACTIVATED',
  'TEAM_MEMBER_DEACTIVATED',
  'SUBSCRIPTION_PLAN_CHANGED',
  'DOCTOR_SEAT_LIMIT_CHANGED',
  'SUBSCRIPTION_INVOICE_CREATED',
  'SUBSCRIPTION_INVOICE_OVERDUE',
  'SUBSCRIPTION_PAYMENT_REPORTED',
  'SUBSCRIPTION_PAYMENT_VERIFIED',
  'PRACTICE_BILLING_RESTRICTED',
  'PRACTICE_SUSPENDED',
  'PRACTICE_REACTIVATED',
  'PRACTICE_UPDATED',
  'PILOT_ACCESS_GRANTED',
  'PILOT_ACCESS_STARTED',
]);

export interface CreatePracticeInput {
  clinicName: string;
  subdomain: string;
  email?: string | null;
  ownerFullName: string;
  ownerEmail: string;
  ownerHpcsaNumber?: string | null;
  subscriptionPlan: SubscriptionPlan;
  doctorSeatLimit?: number;
  monthlyFeeCents?: number;
  inquiryId?: string | null;
  grantPilotProgram?: boolean;
  superAdminId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export function practiceAccessPayload(practice: {
  subscriptionStatus: SubscriptionStatus;
  subscriptionSuspensionReason?: SubscriptionSuspensionReason | null;
  subscriptionSuspendedAt?: Date | null;
  trialEndsAt: Date | null;
  ownerProfileId: string | null;
}) {
  return serializePracticeAccess(derivePracticeAccess(practice));
}

export async function hasOutstandingSubscriptionPayment(
  tx: Prisma.TransactionClient | typeof prisma,
  practiceId: string,
  now: Date
): Promise<boolean> {
  const blocking = await tx.practiceSubscriptionInvoice.findFirst({
    where: {
      practiceId,
      OR: [
        { status: SubscriptionInvoiceStatus.OVERDUE },
        { status: SubscriptionInvoiceStatus.PAYMENT_REPORTED },
        { status: SubscriptionInvoiceStatus.DUE, dueAt: { lt: now } },
      ],
    },
    select: { id: true },
  });
  return Boolean(blocking);
}

export async function applyRequestedSubscriptionStatus(
  tx: Prisma.TransactionClient,
  practice: {
    id: string;
    subscriptionStatus: SubscriptionStatus;
    subscriptionSuspensionReason: SubscriptionSuspensionReason | null;
    subscriptionSuspendedAt: Date | null;
  },
  nextStatus: SubscriptionStatus,
  now: Date
): Promise<{
  statusData: Prisma.PracticeUpdateInput;
  statusAuditAction: 'PRACTICE_SUSPENDED' | 'PRACTICE_REACTIVATED' | null;
  previousReason: SubscriptionSuspensionReason | null;
}> {
  if (nextStatus === SubscriptionStatus.SUSPENDED) {
    if (practice.subscriptionStatus === SubscriptionStatus.SUSPENDED) {
      return {
        statusData: {},
        statusAuditAction: null,
        previousReason: practice.subscriptionSuspensionReason,
      };
    }
    return {
      statusData: {
        subscriptionStatus: SubscriptionStatus.SUSPENDED,
        subscriptionSuspensionReason: SubscriptionSuspensionReason.MANUAL,
        subscriptionSuspendedAt: now,
      },
      statusAuditAction: 'PRACTICE_SUSPENDED',
      previousReason: practice.subscriptionSuspensionReason,
    };
  }

  if (nextStatus === SubscriptionStatus.ACTIVE) {
    if (practice.subscriptionStatus === SubscriptionStatus.CANCELLED) {
      throw new AppError(
        409,
        'A cancelled Practice cannot be reactivated through this workflow.',
        'PRACTICE_CANCELLED'
      );
    }
    if (practice.subscriptionStatus === SubscriptionStatus.SUSPENDED) {
      if (await hasOutstandingSubscriptionPayment(tx, practice.id, now)) {
        throw new AppError(
          409,
          'This Practice has an outstanding subscription payment. Verify payment before reactivating.',
          'OUTSTANDING_SUBSCRIPTION_PAYMENT'
        );
      }
      return {
        statusData: {
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          subscriptionSuspensionReason: null,
          subscriptionSuspendedAt: null,
        },
        statusAuditAction: 'PRACTICE_REACTIVATED',
        previousReason: practice.subscriptionSuspensionReason,
      };
    }
    if (practice.subscriptionStatus === SubscriptionStatus.ACTIVE) {
      return {
        statusData: {},
        statusAuditAction: null,
        previousReason: practice.subscriptionSuspensionReason,
      };
    }
    return {
      statusData: { subscriptionStatus: SubscriptionStatus.ACTIVE },
      statusAuditAction: null,
      previousReason: practice.subscriptionSuspensionReason,
    };
  }

  return {
    statusData: { subscriptionStatus: nextStatus },
    statusAuditAction: null,
    previousReason: practice.subscriptionSuspensionReason,
  };
}

export async function createPracticeWithOwnerInvite(input: CreatePracticeInput) {
  const subdomain = normalizeSubdomain(input.subdomain);
  if (!subdomain || subdomain.length < 2) {
    throw new AppError(400, 'Invalid subdomain');
  }
  if (isReservedSubdomain(subdomain)) {
    throw new AppError(400, 'This subdomain is reserved');
  }

  const existing = await prisma.practice.findUnique({ where: { subdomain } });
  if (existing) throw new AppError(409, 'Subdomain already taken');

  let agreement: { subscriptionPlan: SubscriptionPlan; doctorSeatLimit: number; monthlyFeeCents: number };
  try {
    agreement = resolvePlanAgreement({
      plan: input.subscriptionPlan,
      doctorSeatLimit: input.doctorSeatLimit,
      monthlyFeeCents: input.monthlyFeeCents,
    });
  } catch (err) {
    throw new AppError(400, err instanceof Error ? err.message : 'Invalid plan configuration');
  }

  const now = new Date();
  const trialEndsAt = standardTrialEndsAt(now);
  const grantPilot = Boolean(input.grantPilotProgram);

  const { practice, invitation, token } = await prisma.$transaction(async (tx) => {
    const practice = await tx.practice.create({
      data: {
        subdomain,
        clinicName: input.clinicName.trim(),
        email: input.email?.trim() || input.ownerEmail.trim().toLowerCase(),
        subscriptionStatus: SubscriptionStatus.TRIAL,
        trialEndsAt,
        brandColor: '#1E40AF',
        subscriptionPlan: agreement.subscriptionPlan,
        doctorSeatLimit: agreement.doctorSeatLimit,
        monthlyFeeCents: agreement.monthlyFeeCents,
        ...(grantPilot ? { pilotProgramGrantedAt: now } : {}),
      },
    });

    const { invitation, token } = await createInvitation(
      {
        practiceId: practice.id,
        email: input.ownerEmail,
        fullName: input.ownerFullName,
        role: UserRole.DOCTOR,
        hpcsaNumber: input.ownerHpcsaNumber,
        isPracticeOwner: true,
        invitedBySuperAdminId: input.superAdminId,
      },
      tx
    );

    return { practice, invitation, token };
  });

  const warnings: string[] = [];

  try {
    await logAudit({
      practiceId: practice.id,
      actorSuperAdminId: input.superAdminId,
      action: 'PRACTICE_CREATED',
      resource: 'PRACTICE',
      resourceId: practice.id,
      newValue: {
        subdomain,
        subscriptionPlan: agreement.subscriptionPlan,
        doctorSeatLimit: agreement.doctorSeatLimit,
        monthlyFeeCents: agreement.monthlyFeeCents,
      },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  } catch (err) {
    console.error('[onboarding] PRACTICE_CREATED audit failed (practice exists):', err);
    warnings.push('Audit logging for Practice creation failed — operational warning recorded.');
  }

  try {
    await logAudit({
      practiceId: practice.id,
      actorSuperAdminId: input.superAdminId,
      action: 'OWNER_INVITATION_SENT',
      resource: 'INVITATION',
      resourceId: invitation.id,
      newValue: { email: invitation.email, role: invitation.role },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  } catch (err) {
    console.error('[onboarding] OWNER_INVITATION_SENT audit failed (invitation exists):', err);
    warnings.push('Audit logging for Owner invitation failed — operational warning recorded.');
  }

  if (grantPilot) {
    try {
      await logAudit({
        practiceId: practice.id,
        actorSuperAdminId: input.superAdminId,
        action: 'PILOT_ACCESS_GRANTED',
        resource: 'PRACTICE',
        resourceId: practice.id,
        newValue: { source: 'onboarding', durationDays: 30 },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });
    } catch (err) {
      console.error('[onboarding] PILOT_ACCESS_GRANTED audit failed (practice exists):', err);
      warnings.push('Audit logging for Pilot grant failed — operational warning recorded.');
    }
  }

  let inquiryConversionPending = false;
  if (input.inquiryId) {
    try {
      const inquiry = await prisma.practiceInquiry.findUnique({ where: { id: input.inquiryId } });
      if (inquiry && inquiry.status !== InquiryStatus.CONVERTED) {
        await updateInquiryStatus(inquiry.id, InquiryStatus.CONVERTED);
      }
    } catch (err) {
      console.error('[onboarding] Inquiry conversion failed (practice exists):', err);
      inquiryConversionPending = true;
      warnings.push('Inquiry status update failed — conversion pending; reconcile in Support.');
    }
  }

  let emailDelivered = false;
  try {
    emailDelivered = await sendPracticeInvitationEmail({
      email: invitation.email,
      fullName: invitation.fullName,
      practiceName: practice.clinicName,
      subdomain: practice.subdomain,
      role: invitation.role,
      isPracticeOwner: true,
      token,
    });
  } catch (err) {
    console.error('[onboarding] Owner invitation email failed:', err);
  }

  if (!emailDelivered) {
    warnings.push('Owner invitation email could not be delivered — resend is available.');
  }

  const baseMessage = emailDelivered
    ? 'Practice created. A secure account setup invitation was sent to the Practice Owner.'
    : 'Practice created. Owner invitation could not be delivered.';

  return {
    practice,
    invitation: serializeInvitation(invitation),
    emailDelivered,
    inquiryConversionPending,
    warnings,
    /** Fresh plaintext token for Super Admin UAT URL construction only — never persist. */
    ownerInvitationToken: token,
    message:
      warnings.length > 0 && emailDelivered
        ? `${baseMessage} ${warnings.filter((w) => !w.includes('email')).join(' ')}`.trim()
        : warnings.length > 0 && !emailDelivered
          ? `${baseMessage} ${warnings.join(' ')}`.trim()
          : baseMessage,
  };
}

export async function grantPilotProgramAccess(params: {
  practiceId: string;
  superAdminId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const updated = await prisma.$transaction(async (tx) => {
    await lockPracticeRow(tx, params.practiceId);

    const practice = await tx.practice.findFirst({
      where: { id: params.practiceId, softDeletedAt: null },
    });
    if (!practice) throw new AppError(404, 'Practice not found');

    if (practice.pilotProgramGrantedAt) {
      throw new AppError(
        409,
        'Pilot programme has already been granted for this Practice',
        'PILOT_ALREADY_GRANTED'
      );
    }

    if (practice.subscriptionStatus !== SubscriptionStatus.TRIAL) {
      throw new AppError(
        409,
        `Pilot programme can only be granted to Practices in TRIAL status (current: ${practice.subscriptionStatus})`,
        'PILOT_INVALID_SUBSCRIPTION_STATUS'
      );
    }

    const now = new Date();
    const ownerActivated = Boolean(practice.ownerProfileId);

    if (ownerActivated) {
      const pilotEnd = pilotEndFromStart(now);
      return tx.practice.update({
        where: { id: practice.id },
        data: {
          pilotProgramGrantedAt: now,
          pilotProgramStartsAt: now,
          pilotProgramEndsAt: pilotEnd,
          trialEndsAt: pilotEnd,
          subscriptionStatus: SubscriptionStatus.TRIAL,
        },
      });
    }

    return tx.practice.update({
      where: { id: practice.id },
      data: {
        pilotProgramGrantedAt: now,
        subscriptionStatus: SubscriptionStatus.TRIAL,
      },
    });
  });

  const serializeNow = updated.pilotProgramGrantedAt ?? new Date();
  const ownerActivatedAtGrant = Boolean(updated.pilotProgramStartsAt);

  try {
    await logAudit({
      practiceId: updated.id,
      actorSuperAdminId: params.superAdminId,
      action: 'PILOT_ACCESS_GRANTED',
      resource: 'PRACTICE',
      resourceId: updated.id,
      newValue: ownerActivatedAtGrant
        ? {
            startsAt: updated.pilotProgramStartsAt?.toISOString(),
            endsAt: updated.pilotProgramEndsAt?.toISOString(),
            durationDays: 30,
          }
        : { pendingOwnerActivation: true, durationDays: 30 },
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });
  } catch (err) {
    console.error('[pilot] PILOT_ACCESS_GRANTED audit failed:', err);
  }

  return {
    practice: updated,
    pilot_program: serializePilotProgram(updated, serializeNow),
  };
}

export async function getPracticeWorkspace(practiceId: string) {
  const practice = await prisma.practice.findFirst({
    where: { id: practiceId, softDeletedAt: null },
    include: {
      owner: { select: { id: true, fullName: true, email: true, isActive: true, role: true } },
      profiles: {
        where: { role: { in: [UserRole.DOCTOR, UserRole.ADMIN] }, softDeletedAt: null },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          doctor: { select: { id: true, isVerified: true, hpcsaRegistrationNumber: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      invitations: {
        include: {
          invitedByProfile: { select: { fullName: true, email: true } },
          invitedBySuperAdmin: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
      subscriptionInvoices: { orderBy: { periodStart: 'desc' }, take: 24 },
    },
  });
  if (!practice) throw new AppError(404, 'Practice not found');

  const seats = await getSeatUsage(prisma, practice.id);
  const ownerInvitationExists = practice.invitations.some(
    (inv) => inv.isPracticeOwner && invitationStatus(inv) !== 'REVOKED'
  );
  const onboarding = buildOnboardingChecklist({
    ownerProfileId: practice.ownerProfileId,
    ownerInvitationExists,
    activeReceptionCount: practice.profiles.filter((p) => p.role === UserRole.ADMIN && p.isActive).length,
    activeDoctorCount: practice.profiles.filter((p) => p.role === UserRole.DOCTOR && p.isActive).length,
  });

  const activity = await prisma.auditLog.findMany({
    where: {
      practiceId: practice.id,
      action: { in: [...SAAS_AUDIT_ACTIONS] },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      action: true,
      resource: true,
      resourceId: true,
      createdAt: true,
      actorId: true,
      actorSuperAdminId: true,
    },
  });

  const brandingConfigured = Boolean(
    practice.logoUrl || (practice.brandColor && practice.brandColor !== '#1E40AF') || practice.tagline
  );

  return {
    practice: {
      id: practice.id,
      clinicName: practice.clinicName,
      subdomain: practice.subdomain,
      email: practice.email,
      subscriptionStatus: practice.subscriptionStatus,
      subscriptionPlan: practice.subscriptionPlan,
      doctorSeatLimit: practice.doctorSeatLimit,
      monthlyFeeCents: practice.monthlyFeeCents,
      trialEndsAt: practice.trialEndsAt,
      subscriptionEndsAt: practice.subscriptionEndsAt,
      subscriptionSuspensionReason: practice.subscriptionSuspensionReason,
      subscriptionSuspendedAt: practice.subscriptionSuspendedAt,
      access: practiceAccessPayload(practice),
      setupFeePaid: practice.setupFeePaid,
      createdAt: practice.createdAt,
      owner: practice.owner,
      brandingConfigured,
    },
    pilot_program: serializePilotProgram(practice),
    seats,
    onboarding,
    team: practice.profiles,
    invitations: practice.invitations.map(serializeInvitation),
    invoices: practice.subscriptionInvoices,
    activity,
  };
}

export async function listPracticesOperational(status?: SubscriptionStatus) {
  const practices = await prisma.practice.findMany({
    where: {
      softDeletedAt: null,
      ...(status ? { subscriptionStatus: status } : {}),
    },
    include: {
      owner: { select: { id: true, fullName: true, email: true } },
      invitations: {
        where: { isPracticeOwner: true },
        select: { id: true, acceptedAt: true, revokedAt: true, expiresAt: true },
      },
      _count: { select: { patients: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return Promise.all(
    practices.map(async (practice) => {
      const seats = await getSeatUsage(prisma, practice.id);
      const ownerInvitationExists = practice.invitations.some(
        (inv) => invitationStatus(inv) !== 'REVOKED'
      );
      const onboarding = buildOnboardingChecklist({
        ownerProfileId: practice.ownerProfileId,
        ownerInvitationExists,
        activeReceptionCount: await prisma.profile.count({
          where: {
            practiceId: practice.id,
            role: UserRole.ADMIN,
            isActive: true,
            softDeletedAt: null,
          },
        }),
        activeDoctorCount: seats.active,
      });
      return {
        ...practice,
        invitations: undefined,
        seats,
        onboarding,
        pilot_program: compactPilotProgramIndicator(practice),
        access: practiceAccessPayload(practice),
      };
    })
  );
}

export async function deactivateTeamMember(params: {
  practiceId: string;
  profileId: string;
  actorId: string;
  ownerProfileId: string | null;
}) {
  if (params.profileId === params.actorId) {
    throw new AppError(403, 'You cannot deactivate your own account');
  }
  if (params.ownerProfileId && params.profileId === params.ownerProfileId) {
    throw new AppError(403, 'The Practice Owner cannot be deactivated from Team & Access');
  }

  const profile = await prisma.profile.findFirst({
    where: {
      id: params.profileId,
      practiceId: params.practiceId,
      softDeletedAt: null,
      role: { in: [UserRole.DOCTOR, UserRole.ADMIN] },
    },
  });
  if (!profile) throw new AppError(404, 'Team member not found');
  if (!profile.isActive) return profile;

  const updated = await prisma.profile.update({
    where: { id: profile.id },
    data: { isActive: false },
  });

  await prisma.practiceSession.updateMany({
    where: { profileId: profile.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await logAudit({
    practiceId: params.practiceId,
    actorId: params.actorId,
    action: 'TEAM_MEMBER_DEACTIVATED',
    resource: 'USER',
    resourceId: profile.id,
    newValue: { role: profile.role, email: profile.email },
  });

  return updated;
}

export async function getSaasDashboard() {
  const now = new Date();
  const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const practices = await prisma.practice.findMany({
    where: { softDeletedAt: null },
    select: {
      id: true,
      clinicName: true,
      subdomain: true,
      subscriptionStatus: true,
      monthlyFeeCents: true,
      createdAt: true,
      trialEndsAt: true,
      doctorSeatLimit: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const total = practices.length;
  const active = practices.filter((p) => p.subscriptionStatus === SubscriptionStatus.ACTIVE).length;
  const trial = practices.filter((p) => p.subscriptionStatus === SubscriptionStatus.TRIAL).length;
  const suspended = practices.filter((p) => p.subscriptionStatus === SubscriptionStatus.SUSPENDED).length;
  const configuredMonthlyRevenueCents = practices
    .filter((p) => p.subscriptionStatus === SubscriptionStatus.ACTIVE)
    .reduce((sum, p) => sum + p.monthlyFeeCents, 0);

  const seatUsages = await Promise.all(practices.map((p) => getSeatUsage(prisma, p.id)));
  const doctorSeatsAllocated = seatUsages.reduce((sum, s) => sum + s.allocated, 0);
  const doctorSeatsLimit = practices.reduce((sum, p) => sum + p.doctorSeatLimit, 0);

  const [
    newInquiriesCount,
    recentInquiries,
    ownerInvitationsPending,
    invoicesAwaitingVerification,
    overdueInvoices,
  ] = await Promise.all([
    prisma.practiceInquiry.count({ where: { status: InquiryStatus.NEW } }),
    prisma.practiceInquiry.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
    prisma.practiceInvitation.count({
      where: {
        isPracticeOwner: true,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
    }),
    prisma.practiceSubscriptionInvoice.count({
      where: { status: 'PAYMENT_REPORTED' },
    }),
    prisma.practiceSubscriptionInvoice.count({
      where: { status: 'OVERDUE' },
    }),
  ]);

  const trialsEndingSoon = practices.filter(
    (p) =>
      p.subscriptionStatus === SubscriptionStatus.TRIAL &&
      p.trialEndsAt &&
      p.trialEndsAt >= now &&
      p.trialEndsAt <= soon
  ).length;

  const trialsExpired = practices.filter(
    (p) =>
      p.subscriptionStatus === SubscriptionStatus.TRIAL &&
      p.trialEndsAt &&
      p.trialEndsAt < now
  ).length;

  return {
    stats: {
      totalPractices: total,
      activePractices: active,
      trialPractices: trial,
      suspendedPractices: suspended,
      monthlyRecurringRevenueCents: configuredMonthlyRevenueCents,
      configuredMonthlyRevenueCents,
      doctorSeatsAllocated,
      doctorSeatsLimit,
      newInquiriesCount,
      ownerInvitationsPending,
      trialsEndingSoon,
      trialsExpired,
      invoicesAwaitingVerification,
      overdueInvoices,
    },
    recentSignups: practices.slice(0, 5),
    recentInquiries,
  };
}

export async function getSupportQueue() {
  const now = new Date();
  const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [
    trialEnding,
    trialsExpired,
    overdueInvoices,
    paymentReported,
    expiredOwnerInvites,
    unactivatedOwnerPractices,
    suspended,
  ] = await Promise.all([
    prisma.practice.findMany({
      where: {
        softDeletedAt: null,
        subscriptionStatus: SubscriptionStatus.TRIAL,
        trialEndsAt: { gte: now, lte: soon },
      },
      select: { id: true, clinicName: true, subdomain: true, subscriptionStatus: true, trialEndsAt: true },
    }),
    prisma.practice.findMany({
      where: {
        softDeletedAt: null,
        subscriptionStatus: SubscriptionStatus.TRIAL,
        trialEndsAt: { lt: now },
      },
      select: { id: true, clinicName: true, subdomain: true, subscriptionStatus: true, trialEndsAt: true },
    }),
    prisma.practiceSubscriptionInvoice.findMany({
      where: { status: 'OVERDUE' },
      include: { practice: { select: { id: true, clinicName: true, subdomain: true } } },
      orderBy: { dueAt: 'asc' },
      take: 50,
    }),
    prisma.practiceSubscriptionInvoice.findMany({
      where: { status: 'PAYMENT_REPORTED' },
      include: { practice: { select: { id: true, clinicName: true, subdomain: true } } },
      orderBy: { paymentReportedAt: 'asc' },
      take: 50,
    }),
    prisma.practiceInvitation.findMany({
      where: {
        isPracticeOwner: true,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { lte: now },
      },
      include: { practice: { select: { id: true, clinicName: true, subdomain: true } } },
      take: 50,
    }),
    prisma.practice.findMany({
      where: { softDeletedAt: null, ownerProfileId: null },
      select: { id: true, clinicName: true, subdomain: true, subscriptionStatus: true, createdAt: true },
    }),
    prisma.practice.findMany({
      where: { softDeletedAt: null, subscriptionStatus: SubscriptionStatus.SUSPENDED },
      select: {
        id: true,
        clinicName: true,
        subdomain: true,
        subscriptionStatus: true,
        subscriptionSuspensionReason: true,
        subscriptionSuspendedAt: true,
        trialEndsAt: true,
        ownerProfileId: true,
      },
    }),
  ]);

  const unactivatedPracticeIds = unactivatedOwnerPractices.map((p) => p.id);
  const pendingOwnerInvites =
    unactivatedPracticeIds.length === 0
      ? []
      : await prisma.practiceInvitation.findMany({
          where: {
            practiceId: { in: unactivatedPracticeIds },
            isPracticeOwner: true,
            acceptedAt: null,
            revokedAt: null,
          },
          orderBy: { createdAt: 'desc' },
        });

  const inviteByPractice = new Map<string, (typeof pendingOwnerInvites)[number]>();
  for (const invite of pendingOwnerInvites) {
    if (!inviteByPractice.has(invite.practiceId)) {
      inviteByPractice.set(invite.practiceId, invite);
    }
  }

  const unactivatedOwners = unactivatedOwnerPractices.map((p) => {
    const invite = inviteByPractice.get(p.id);
    return {
      id: p.id,
      clinicName: p.clinicName,
      subdomain: p.subdomain,
      subscriptionStatus: p.subscriptionStatus,
      createdAt: p.createdAt,
      ownerInvite: invite
        ? {
            id: invite.id,
            fullName: invite.fullName,
            email: invite.email,
            status: invitationStatus(invite, now),
            sentAt: invite.createdAt,
            expiresAt: invite.expiresAt,
          }
        : null,
    };
  });

  const suspendedWithAccess = suspended.map((p) => ({
    ...p,
    access: practiceAccessPayload(p),
  }));

  return {
    generatedAt: now,
    trialEnding,
    trialsExpired,
    overdueInvoices,
    paymentReported,
    expiredOwnerInvites,
    unactivatedOwners,
    suspended: suspendedWithAccess,
  };
}
