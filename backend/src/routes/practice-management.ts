import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { SubscriptionStatus, UserRole } from '@prisma/client';
import { prisma } from '../config/database';
import { authenticate, requirePracticeOwner } from '../middleware/auth';
import { requireTenant, tenantWhere } from '../middleware/tenant';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { toSnakeCase } from '../utils/serialize';
import { logAudit } from '../services/auditService';
import {
  createInvitation,
  resendInvitation,
  revokeInvitation,
  serializeInvitation,
} from '../services/invitationService';
import { sendPaymentReportedEmail, sendPracticeInvitationEmail } from '../services/emailService';
import { getSeatUsage } from '../services/seatService';
import { deactivateTeamMember } from '../services/saasPracticeService';
import { reportEftPayment } from '../services/subscriptionInvoiceService';
import { getEftPaymentInstructions } from '../config/eftPayment';
import { checkRateLimit, clientIp } from '../utils/rateLimit';
import { toSafeProfile } from '../utils/safeProfile';

const router = Router();

router.use(requireTenant, authenticate, requirePracticeOwner);

router.get(
  '/eft-instructions',
  asyncHandler(async (_req: Request, res: Response) => {
    const instructions = getEftPaymentInstructions();
    res.json(toSnakeCase({ configured: Boolean(instructions), instructions }));
  })
);

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const practice = await prisma.practice.findUnique({
      where: { id: practiceId },
      include: {
        owner: { select: { id: true, fullName: true, email: true } },
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
    if (practice.subscriptionStatus === SubscriptionStatus.CANCELLED) {
      throw new AppError(403, 'This Practice is cancelled', 'PRACTICE_CANCELLED');
    }

    const seats = await getSeatUsage(prisma, practiceId);

    res.json(
      toSnakeCase({
        practice: {
          id: practice.id,
          clinicName: practice.clinicName,
          subdomain: practice.subdomain,
          subscriptionPlan: practice.subscriptionPlan,
          subscriptionStatus: practice.subscriptionStatus,
          doctorSeatLimit: practice.doctorSeatLimit,
          monthlyFeeCents: practice.monthlyFeeCents,
          trialEndsAt: practice.trialEndsAt,
          owner: practice.owner,
        },
        seats,
        team: practice.profiles,
        invitations: practice.invitations.map(serializeInvitation),
        invoices: practice.subscriptionInvoices,
      })
    );
  })
);

const inviteDoctorSchema = z.object({
  full_name: z.string().min(1),
  email: z.string().email(),
  hpcsa_number: z.string().min(1).optional(),
});

router.post(
  '/invitations/doctors',
  asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const body = inviteDoctorSchema.parse(req.body);
    const practice = await prisma.practice.findUnique({ where: { id: practiceId } });
    if (!practice) throw new AppError(404, 'Practice not found');
    if (practice.subscriptionStatus === SubscriptionStatus.CANCELLED) {
      throw new AppError(409, 'Cannot invite users to a cancelled Practice');
    }

    const { invitation, token } = await createInvitation({
      practiceId,
      email: body.email,
      fullName: body.full_name,
      role: UserRole.DOCTOR,
      hpcsaNumber: body.hpcsa_number,
      invitedByProfileId: req.user!.userId,
    });

    await logAudit({
      practiceId,
      actorId: req.user!.userId,
      action: 'TEAM_MEMBER_INVITED',
      resource: 'INVITATION',
      resourceId: invitation.id,
      newValue: { email: invitation.email, role: invitation.role },
    });

    let emailDelivered = false;
    try {
      emailDelivered = await sendPracticeInvitationEmail({
        email: invitation.email,
        fullName: invitation.fullName,
        practiceName: practice.clinicName,
        subdomain: practice.subdomain,
        role: invitation.role,
        isPracticeOwner: false,
        token,
      });
    } catch (err) {
      console.error('[owner-invite] Doctor invitation email failed:', err);
    }

    res.status(201).json(
      toSnakeCase({
        invitation: serializeInvitation(invitation),
        emailDelivered,
        message: emailDelivered
          ? 'Doctor invitation sent.'
          : 'Invitation created but the email could not be delivered.',
      })
    );
  })
);

const inviteReceptionSchema = z.object({
  full_name: z.string().min(1),
  email: z.string().email(),
});

router.post(
  '/invitations/reception',
  asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const body = inviteReceptionSchema.parse(req.body);
    const practice = await prisma.practice.findUnique({ where: { id: practiceId } });
    if (!practice) throw new AppError(404, 'Practice not found');
    if (practice.subscriptionStatus === SubscriptionStatus.CANCELLED) {
      throw new AppError(409, 'Cannot invite users to a cancelled Practice');
    }

    const { invitation, token } = await createInvitation({
      practiceId,
      email: body.email,
      fullName: body.full_name,
      role: UserRole.ADMIN,
      invitedByProfileId: req.user!.userId,
    });

    await logAudit({
      practiceId,
      actorId: req.user!.userId,
      action: 'TEAM_MEMBER_INVITED',
      resource: 'INVITATION',
      resourceId: invitation.id,
      newValue: { email: invitation.email, role: invitation.role },
    });

    let emailDelivered = false;
    try {
      emailDelivered = await sendPracticeInvitationEmail({
        email: invitation.email,
        fullName: invitation.fullName,
        practiceName: practice.clinicName,
        subdomain: practice.subdomain,
        role: invitation.role,
        isPracticeOwner: false,
        token,
      });
    } catch (err) {
      console.error('[owner-invite] Reception invitation email failed:', err);
    }

    res.status(201).json(
      toSnakeCase({
        invitation: serializeInvitation(invitation),
        emailDelivered,
        message: emailDelivered
          ? 'Reception invitation sent.'
          : 'Invitation created but the email could not be delivered.',
      })
    );
  })
);

router.post(
  '/invitations/:id/resend',
  asyncHandler(async (req: Request, res: Response) => {
    const ip = clientIp(req);
    if (!checkRateLimit({ bucket: 'invite-resend', key: `${ip}:${req.params.id}`, max: 10, windowMs: 60 * 60 * 1000 })) {
      throw new AppError(429, 'Too many resend attempts. Please try again later.');
    }
    const { practiceId } = tenantWhere(req);
    const { invitation, token } = await resendInvitation(req.params.id, practiceId);
    const practice = await prisma.practice.findUnique({ where: { id: practiceId } });
    if (!practice) throw new AppError(404, 'Practice not found');

    await logAudit({
      practiceId,
      actorId: req.user!.userId,
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
      console.error('[owner-invite] Resend email failed:', err);
    }

    res.json(
      toSnakeCase({
        invitation: serializeInvitation(invitation),
        emailDelivered,
      })
    );
  })
);

router.post(
  '/invitations/:id/revoke',
  asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const invitation = await revokeInvitation(req.params.id, practiceId);
    await logAudit({
      practiceId,
      actorId: req.user!.userId,
      action: 'INVITATION_REVOKED',
      resource: 'INVITATION',
      resourceId: invitation.id,
    });
    res.json(toSnakeCase({ invitation: serializeInvitation(invitation) }));
  })
);

router.post(
  '/members/:profileId/deactivate',
  asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const practice = await prisma.practice.findUnique({
      where: { id: practiceId },
      select: { ownerProfileId: true },
    });
    const updated = await deactivateTeamMember({
      practiceId,
      profileId: req.params.profileId,
      actorId: req.user!.userId,
      ownerProfileId: practice?.ownerProfileId ?? null,
    });
    res.json(toSnakeCase({ profile: toSafeProfile(updated) }));
  })
);

const reportSchema = z.object({
  payment_reference: z.string().min(1).max(120),
});

router.post(
  '/invoices/:invoiceId/report-payment',
  asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const body = reportSchema.parse(req.body);
    const invoice = await reportEftPayment({
      practiceId,
      invoiceId: req.params.invoiceId,
      actorId: req.user!.userId,
      paymentReference: body.payment_reference,
    });

    const practice = await prisma.practice.findUnique({
      where: { id: practiceId },
      include: { owner: { select: { email: true, fullName: true } } },
    });
    if (practice?.owner) {
      try {
        await sendPaymentReportedEmail({
          email: practice.owner.email,
          fullName: practice.owner.fullName,
          practiceName: practice.clinicName,
          invoiceNumber: invoice.invoiceNumber,
          amountCents: invoice.amountCents,
          paymentReference: invoice.paymentReference ?? body.payment_reference,
        });
      } catch (err) {
        console.error('[billing] Payment reported email failed:', err);
      }
    }

    res.json(toSnakeCase({ invoice }));
  })
);

export default router;
