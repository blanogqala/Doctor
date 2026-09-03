import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import {
  InquiryStatus,
  SubscriptionInvoiceStatus,
  SubscriptionPlan,
  SubscriptionStatus,
  ClinicalChartAccessMode,
} from '@prisma/client';
import { prisma } from '../config/database';
import {
  authenticateSuperAdmin,
  authorizeSuperAdmin,
  requirePlatformOrigin,
} from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { toSnakeCase } from '../utils/serialize';
import { logAudit } from '../services/auditService';
import { sendPaymentVerifiedEmail, sendPracticeInvitationEmail } from '../services/emailService';
import {
  countUnreadNotifications,
  getInquiryById,
  listInquiries,
  listNotifications,
  markNotificationRead,
  updateInquiryStatus,
} from '../services/inquiryService';
import {
  applyRequestedSubscriptionStatus,
  createPracticeWithOwnerInvite,
  getPracticeWorkspace,
  getSaasDashboard,
  getSupportQueue,
  grantPilotProgramAccess,
  listPracticesOperational,
  updateClinicalChartAccessMode,
} from '../services/saasPracticeService';
import { resolvePlanAgreement, assertPlanSeatLimit } from '../config/subscriptionPlans';
import { assertSeatLimitNotBelowAllocated, getSeatUsage, lockPracticeRow } from '../services/seatService';
import { resendInvitation, revokeInvitation, serializeInvitation } from '../services/invitationService';
import {
  generateMonthlySubscriptionInvoices,
  verifySubscriptionPayment,
  refreshOverdueSubscriptionInvoices,
} from '../services/subscriptionInvoiceService';
import { checkRateLimit, clientIp } from '../utils/rateLimit';
import { buildUatInvitationUrlIfEnabled } from '../config/uatInvitationLinks';
import {
  createPlatformSession,
  revokePlatformSessionByRawToken,
} from '../services/sessionService';
import {
  clearPlatformSessionCookie,
  getPlatformSessionRawToken,
  setPlatformSessionCookie,
} from '../utils/cookies';
import { generateSecureToken, hashToken } from '../utils/secureToken';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post(
  '/login',
  asyncHandler(async (req: Request, res: Response) => {
    const ip = clientIp(req);
    if (!checkRateLimit({ bucket: 'sa-login', key: ip, max: 20, windowMs: 15 * 60 * 1000 })) {
      throw new AppError(429, 'Too many login attempts. Please try again later.');
    }
    const { email, password } = loginSchema.parse(req.body);
    const admin = await prisma.superAdmin.findUnique({ where: { email } });
    if (!admin) throw new AppError(401, 'Invalid credentials');

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) throw new AppError(401, 'Invalid credentials');

    await prisma.superAdmin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    const session = await createPlatformSession({
      superAdminId: admin.id,
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });
    setPlatformSessionCookie(res, session.rawToken);

    res.json({
      csrf_token: session.csrfToken,
      user: toSnakeCase({
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        isSuperAdmin: true,
      }),
    });
  })
);

router.use(requirePlatformOrigin, authenticateSuperAdmin, authorizeSuperAdmin);

router.post(
  '/logout',
  asyncHandler(async (req: Request, res: Response) => {
    await revokePlatformSessionByRawToken(getPlatformSessionRawToken(req));
    clearPlatformSessionCookie(res);
    res.json({ success: true });
  })
);

router.get(
  '/me',
  asyncHandler(async (req: Request, res: Response) => {
    const admin = await prisma.superAdmin.findUnique({
      where: { id: req.superAdmin!.superAdminId },
    });
    if (!admin) throw new AppError(401, 'Invalid session');

    const csrfToken = generateSecureToken();
    if (req.platformSession?.id) {
      await prisma.platformSession.update({
        where: { id: req.platformSession.id },
        data: { csrfTokenHash: hashToken(csrfToken) },
      });
      req.platformSession.csrfTokenHash = hashToken(csrfToken);
    }

    res.json({
      user: toSnakeCase({
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        isSuperAdmin: true,
      }),
      csrf_token: csrfToken,
    });
  })
);

router.get(
  '/dashboard',
  asyncHandler(async (_req: Request, res: Response) => {
    const data = await getSaasDashboard();
    res.json(toSnakeCase(data));
  })
);

router.get(
  '/practices',
  asyncHandler(async (req: Request, res: Response) => {
    const status = req.query.status ? String(req.query.status).toUpperCase() : undefined;
    const practices = await listPracticesOperational(
      status ? (status as SubscriptionStatus) : undefined
    );
    res.json(toSnakeCase(practices));
  })
);

const onboardSchema = z.object({
  clinic_name: z.string().min(1),
  subdomain: z.string().min(2).max(63),
  email: z.string().email().optional(),
  owner_full_name: z.string().min(1),
  owner_email: z.string().email(),
  owner_hpcsa_number: z.string().optional(),
  subscription_plan: z.nativeEnum(SubscriptionPlan),
  doctor_seat_limit: z.number().int().positive().optional(),
  monthly_fee_cents: z.number().int().positive().optional(),
  inquiry_id: z.string().optional(),
  grant_pilot_program: z.boolean().optional(),
});

router.post(
  '/practices',
  asyncHandler(async (req: Request, res: Response) => {
    const body = onboardSchema.parse(req.body);
    const result = await createPracticeWithOwnerInvite({
      clinicName: body.clinic_name,
      subdomain: body.subdomain,
      email: body.email,
      ownerFullName: body.owner_full_name,
      ownerEmail: body.owner_email,
      ownerHpcsaNumber: body.owner_hpcsa_number,
      subscriptionPlan: body.subscription_plan,
      doctorSeatLimit: body.doctor_seat_limit,
      monthlyFeeCents: body.monthly_fee_cents,
      inquiryId: body.inquiry_id,
      grantPilotProgram: body.grant_pilot_program,
      superAdminId: req.superAdmin!.superAdminId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    const uatInvitationUrl = buildUatInvitationUrlIfEnabled(
      result.practice.subdomain,
      result.ownerInvitationToken
    );

    res.status(201).json(
      toSnakeCase({
        practice: result.practice,
        invitation: result.invitation,
        email_delivered: result.emailDelivered,
        message: result.message,
        ...(uatInvitationUrl ? { uatInvitationUrl } : {}),
      })
    );
  })
);

router.get(
  '/practices/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const workspace = await getPracticeWorkspace(req.params.id);
    res.json(toSnakeCase(workspace));
  })
);

router.post(
  '/practices/:id/pilot-program/grant',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await grantPilotProgramAccess({
      practiceId: req.params.id,
      superAdminId: req.superAdmin!.superAdminId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.json(toSnakeCase({ pilot_program: result.pilot_program }));
  })
);

const clinicalChartAccessSchema = z.object({
  mode: z.nativeEnum(ClinicalChartAccessMode),
});

router.patch(
  '/practices/:id/clinical-chart-access',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = clinicalChartAccessSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'Invalid clinical chart access mode');
    }
    const result = await updateClinicalChartAccessMode({
      practiceId: req.params.id,
      mode: parsed.data.mode,
      superAdminId: req.superAdmin!.superAdminId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.json(
      toSnakeCase({
        practice_id: result.practiceId,
        clinical_chart_access_mode: result.clinicalChartAccessMode,
        changed: result.changed,
      })
    );
  })
);

const patchSchema = z.object({
  subscription_status: z.nativeEnum(SubscriptionStatus).optional(),
  trial_ends_at: z.string().datetime().optional(),
  clinic_name: z.string().min(1).optional(),
  setup_fee_paid: z.boolean().optional(),
  monthly_fee_cents: z.number().int().positive().optional(),
  subscription_plan: z.nativeEnum(SubscriptionPlan).optional(),
  doctor_seat_limit: z.number().int().positive().optional(),
  verify_doctor_id: z.string().uuid().optional(),
});

router.patch(
  '/practices/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const body = patchSchema.parse(req.body);
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const practice = await tx.practice.findFirst({
        where: { id: req.params.id, softDeletedAt: null },
      });
      if (!practice) throw new AppError(404, 'Practice not found');

      await lockPracticeRow(tx, practice.id);
      const locked = await tx.practice.findFirst({
        where: { id: practice.id, softDeletedAt: null },
      });
      if (!locked) throw new AppError(404, 'Practice not found');

      let nextPlan = locked.subscriptionPlan;
      let nextSeats = locked.doctorSeatLimit;
      let nextFee = locked.monthlyFeeCents;

      if (body.subscription_plan && body.subscription_plan !== locked.subscriptionPlan) {
        try {
          const agreement = resolvePlanAgreement({
            plan: body.subscription_plan,
            doctorSeatLimit: body.doctor_seat_limit ?? undefined,
            monthlyFeeCents: body.monthly_fee_cents ?? locked.monthlyFeeCents,
          });
          nextPlan = agreement.subscriptionPlan;
          nextSeats = agreement.doctorSeatLimit;
          nextFee = agreement.monthlyFeeCents;
        } catch (err) {
          throw new AppError(400, err instanceof Error ? err.message : 'Invalid plan configuration');
        }
      } else {
        if (body.doctor_seat_limit != null) nextSeats = body.doctor_seat_limit;
        if (body.monthly_fee_cents != null) nextFee = body.monthly_fee_cents;
      }

      try {
        assertPlanSeatLimit(nextPlan, nextSeats);
      } catch (err) {
        throw new AppError(400, err instanceof Error ? err.message : 'Invalid seat configuration');
      }

      if (nextSeats !== locked.doctorSeatLimit) {
        await assertSeatLimitNotBelowAllocated(tx, locked.id, nextSeats);
      }

      let statusData = {};
      let statusAuditAction: 'PRACTICE_SUSPENDED' | 'PRACTICE_REACTIVATED' | null = null;
      let previousReason = locked.subscriptionSuspensionReason;
      if (body.subscription_status) {
        const transition = await applyRequestedSubscriptionStatus(
          tx,
          locked,
          body.subscription_status,
          now
        );
        statusData = transition.statusData;
        statusAuditAction = transition.statusAuditAction;
        previousReason = transition.previousReason;
      }

      const updated = await tx.practice.update({
        where: { id: locked.id },
        data: {
          ...statusData,
          trialEndsAt: body.trial_ends_at ? new Date(body.trial_ends_at) : undefined,
          clinicName: body.clinic_name,
          setupFeePaid: body.setup_fee_paid,
          monthlyFeeCents: nextFee,
          subscriptionPlan: nextPlan,
          doctorSeatLimit: nextSeats,
        },
      });

      if (body.verify_doctor_id) {
        await tx.doctor.updateMany({
          where: { id: body.verify_doctor_id, practiceId: locked.id },
          data: { isVerified: true },
        });
      }

      return {
        locked,
        updated,
        nextPlan,
        nextSeats,
        statusAuditAction,
        previousReason,
      };
    });

    const { locked, updated, nextPlan, nextSeats, statusAuditAction, previousReason } = result;

    const auditAction =
      statusAuditAction ??
      (nextPlan !== locked.subscriptionPlan
        ? 'SUBSCRIPTION_PLAN_CHANGED'
        : nextSeats !== locked.doctorSeatLimit
          ? 'DOCTOR_SEAT_LIMIT_CHANGED'
          : 'PRACTICE_UPDATED');

    await logAudit({
      practiceId: locked.id,
      actorSuperAdminId: req.superAdmin!.superAdminId,
      action: auditAction,
      resource: 'PRACTICE',
      resourceId: locked.id,
      oldValue: {
        subscriptionStatus: locked.subscriptionStatus,
        subscriptionSuspensionReason: previousReason,
        subscriptionPlan: locked.subscriptionPlan,
        doctorSeatLimit: locked.doctorSeatLimit,
        monthlyFeeCents: locked.monthlyFeeCents,
      },
      newValue:
        auditAction === 'PRACTICE_REACTIVATED'
          ? {
              subscriptionStatus: SubscriptionStatus.ACTIVE,
              subscriptionSuspensionReason: null,
            }
          : (body as Record<string, unknown>),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    const seats = await getSeatUsage(prisma, locked.id);
    res.json(toSnakeCase({ ...updated, seats }));
  })
);

router.post(
  '/practices/:id/invitations/:invitationId/resend',
  asyncHandler(async (req: Request, res: Response) => {
    const ip = clientIp(req);
    if (
      !checkRateLimit({
        bucket: 'sa-invite-resend',
        key: `${ip}:${req.params.invitationId}`,
        max: 10,
        windowMs: 60 * 60 * 1000,
      })
    ) {
      throw new AppError(429, 'Too many resend attempts. Please try again later.');
    }
    const { invitation, token } = await resendInvitation(req.params.invitationId, req.params.id);
    const practice = await prisma.practice.findUnique({ where: { id: req.params.id } });
    if (!practice) throw new AppError(404, 'Practice not found');

    await logAudit({
      practiceId: practice.id,
      actorSuperAdminId: req.superAdmin!.superAdminId,
      action: 'INVITATION_RESENT',
      resource: 'INVITATION',
      resourceId: invitation.id,
    });

    let emailDelivered = false;
    try {
      emailDelivered = await sendPracticeInvitationEmail({
        email: invitation.email,
        fullName: invitation.fullName,
        practiceName: practice.clinicName,
        subdomain: practice.subdomain,
        role: invitation.role,
        isPracticeOwner: invitation.isPracticeOwner,
        token,
        isResend: true,
      });
    } catch (err) {
      console.error('[super-admin] Invitation resend email failed:', err);
    }

    const uatInvitationUrl = buildUatInvitationUrlIfEnabled(practice.subdomain, token);

    res.json(
      toSnakeCase({
        invitation: serializeInvitation(invitation),
        email_delivered: emailDelivered,
        ...(uatInvitationUrl ? { uatInvitationUrl } : {}),
      })
    );
  })
);

router.post(
  '/practices/:id/invitations/:invitationId/revoke',
  asyncHandler(async (req: Request, res: Response) => {
    const invitation = await revokeInvitation(req.params.invitationId, req.params.id);
    await logAudit({
      practiceId: req.params.id,
      actorSuperAdminId: req.superAdmin!.superAdminId,
      action: 'INVITATION_REVOKED',
      resource: 'INVITATION',
      resourceId: invitation.id,
    });
    res.json(toSnakeCase({ invitation: serializeInvitation(invitation) }));
  })
);

router.get(
  '/support',
  asyncHandler(async (_req: Request, res: Response) => {
    await refreshOverdueSubscriptionInvoices();
    const data = await getSupportQueue();
    res.json(toSnakeCase(data));
  })
);

router.get(
  '/billing',
  asyncHandler(async (req: Request, res: Response) => {
    await refreshOverdueSubscriptionInvoices();
    const status = req.query.status
      ? (String(req.query.status).toUpperCase() as SubscriptionInvoiceStatus)
      : undefined;
    const search = req.query.search ? String(req.query.search).trim() : '';
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));

    const practices = await prisma.practice.findMany({
      where: { softDeletedAt: null, subscriptionStatus: SubscriptionStatus.ACTIVE },
      select: { monthlyFeeCents: true },
    });
    const configuredMonthlyRevenueCents = practices.reduce((sum, p) => sum + p.monthlyFeeCents, 0);

    const [paidThisMonth, outstanding, overdue, verificationQueue, invoices] = await Promise.all([
      prisma.practiceSubscriptionInvoice.aggregate({
        where: {
          status: SubscriptionInvoiceStatus.PAID,
          paidAt: { gte: monthStart, lte: monthEnd },
        },
        _sum: { amountCents: true },
      }),
      prisma.practiceSubscriptionInvoice.aggregate({
        where: {
          status: {
            in: [SubscriptionInvoiceStatus.DUE, SubscriptionInvoiceStatus.PAYMENT_REPORTED, SubscriptionInvoiceStatus.OVERDUE],
          },
        },
        _sum: { amountCents: true },
      }),
      prisma.practiceSubscriptionInvoice.aggregate({
        where: { status: SubscriptionInvoiceStatus.OVERDUE },
        _sum: { amountCents: true },
      }),
      prisma.practiceSubscriptionInvoice.findMany({
        where: { status: SubscriptionInvoiceStatus.PAYMENT_REPORTED },
        include: { practice: { select: { id: true, clinicName: true, subdomain: true } } },
        orderBy: { paymentReportedAt: 'asc' },
      }),
      prisma.practiceSubscriptionInvoice.findMany({
        where: {
          ...(status ? { status } : {}),
          ...(search
            ? {
                practice: {
                  OR: [
                    { clinicName: { contains: search, mode: 'insensitive' } },
                    { subdomain: { contains: search, mode: 'insensitive' } },
                  ],
                },
              }
            : {}),
        },
        include: { practice: { select: { id: true, clinicName: true, subdomain: true } } },
        orderBy: { dueAt: 'desc' },
        take: 100,
      }),
    ]);

    res.json(
      toSnakeCase({
        metrics: {
          configuredMonthlyRevenueCents,
          paidThisMonthCents: paidThisMonth._sum.amountCents ?? 0,
          outstandingCents: outstanding._sum.amountCents ?? 0,
          overdueCents: overdue._sum.amountCents ?? 0,
        },
        verificationQueue,
        invoices,
      })
    );
  })
);

router.post(
  '/billing/generate',
  asyncHandler(async (req: Request, res: Response) => {
    await refreshOverdueSubscriptionInvoices();
    const result = await generateMonthlySubscriptionInvoices();
    res.json(toSnakeCase(result));
  })
);

router.post(
  '/invoices/:id/verify',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await verifySubscriptionPayment({
      invoiceId: req.params.id,
      superAdminId: req.superAdmin!.superAdminId,
    });
    const invoice = result.invoice;

    if (!result.alreadyPaid && invoice.paidAt && invoice.practice.ownerProfileId) {
      const owner = await prisma.profile.findFirst({
        where: { id: invoice.practice.ownerProfileId },
      });
      if (owner) {
        try {
          await sendPaymentVerifiedEmail({
            email: owner.email,
            fullName: owner.fullName,
            practiceName: invoice.practice.clinicName,
            invoiceNumber: invoice.invoiceNumber,
            amountCents: invoice.amountCents,
          });
        } catch (err) {
          console.error('[super-admin] Payment verified email failed:', err);
        }
      }
    }

    res.json(
      toSnakeCase({
        invoice,
        already_paid: result.alreadyPaid,
        remains_suspended: result.remainsSuspended,
        subscription_status: result.nextStatus,
        suspension_reason: result.suspensionReason,
        message: result.remainsSuspended
          ? 'Payment verified. Practice remains read-only until reactivated.'
          : undefined,
      })
    );
  })
);

router.get(
  '/inquiries',
  asyncHandler(async (req: Request, res: Response) => {
    const status = req.query.status
      ? (String(req.query.status).toUpperCase() as InquiryStatus)
      : undefined;
    const inquiries = await listInquiries({ status });
    res.json(toSnakeCase(inquiries));
  })
);

router.get(
  '/inquiries/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const inquiry = await getInquiryById(req.params.id);
    if (!inquiry) throw new AppError(404, 'Inquiry not found');
    res.json(toSnakeCase(inquiry));
  })
);

const patchInquirySchema = z.object({
  status: z.nativeEnum(InquiryStatus),
});

router.patch(
  '/inquiries/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const body = patchInquirySchema.parse(req.body);
    const inquiry = await getInquiryById(req.params.id);
    if (!inquiry) throw new AppError(404, 'Inquiry not found');
    const updated = await updateInquiryStatus(inquiry.id, body.status);
    res.json(toSnakeCase(updated));
  })
);

router.get(
  '/notifications',
  asyncHandler(async (req: Request, res: Response) => {
    const unreadOnly = req.query.unread === '1';
    const [notifications, unreadCount] = await Promise.all([
      listNotifications({ unreadOnly, limit: 20 }),
      countUnreadNotifications(),
    ]);
    res.json(toSnakeCase({ notifications, unread_count: unreadCount }));
  })
);

router.patch(
  '/notifications/:id/read',
  asyncHandler(async (req: Request, res: Response) => {
    const notification = await markNotificationRead(req.params.id);
    res.json(toSnakeCase(notification));
  })
);

export default router;
