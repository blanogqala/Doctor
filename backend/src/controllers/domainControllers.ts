import { Request, Response } from 'express';
import { MessageType, UserRole } from '@prisma/client';
import { prisma } from '../config/database';
import { toSnakeCase, generateInvoiceNumber } from '../utils/serialize';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { paymentInclude, messageInclude } from '../utils/includes';
import { toSafeProfile } from '../utils/safeProfile';
import { toRoleScopedMessageDto, toRoleScopedPaymentDto } from '../utils/patientDto';
import { tenantWhere } from '../middleware/tenant';
import { getPatientIdForProfile, assertPatientAccess } from '../services/accessService';
import {
  isAllowedChatPair,
  startAdminChat,
} from '../services/messageService';
import { logAudit } from '../services/auditService';

async function buildPaymentWhere(req: Request) {
  const { role, userId } = req.user!;
  const { practiceId } = tenantWhere(req);
  const base: Record<string, unknown> = { practiceId };

  if (req.query.status) base.status = String(req.query.status);
  if (req.query.patient_id) base.patientId = String(req.query.patient_id);

  if (role === UserRole.PATIENT) {
    const patientId = await getPatientIdForProfile(userId, practiceId);
    base.patientId = patientId;
  }

  return base;
}

export const paymentController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const payments = await prisma.payment.findMany({
      where: await buildPaymentWhere(req),
      include: paymentInclude,
      orderBy: { createdAt: 'desc' },
    });
    res.json(toSnakeCase(payments.map((payment) => toRoleScopedPaymentDto(req.user!.role, payment))));
  }),

  count: asyncHandler(async (req: Request, res: Response) => {
    const where = await buildPaymentWhere(req);
    const count = await prisma.payment.count({ where });
    res.json({ count });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const body = req.body as Record<string, unknown>;
    const patientId = String(body.patient_id);

    const patient = await prisma.patient.findFirst({
      where: { id: patientId, practiceId, softDeletedAt: null },
    });
    if (!patient) throw new AppError(400, 'Invalid patient for this practice');

    if (body.appointment_id) {
      const appointment = await prisma.appointment.findFirst({
        where: { id: String(body.appointment_id), practiceId, softDeletedAt: null },
      });
      if (!appointment) throw new AppError(400, 'Invalid appointment for this practice');
    }

    const payment = await prisma.payment.create({
      data: {
        practiceId,
        patientId,
        appointmentId: (body.appointment_id as string) ?? null,
        amountCents: Number(body.amount_cents),
        status: (body.status as never) ?? 'UNPAID',
        method: (body.method as never) ?? null,
        invoiceNumber: generateInvoiceNumber(),
        createdBy: req.user!.userId,
      },
      include: paymentInclude,
    });
    res.status(201).json(toSnakeCase(toRoleScopedPaymentDto(req.user!.role, payment)));
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const body = req.body as Record<string, unknown>;
    const existing = await prisma.payment.findFirst({
      where: { id: req.params.id, practiceId },
    });
    if (!existing) throw new AppError(404, 'Payment not found');

    const payment = await prisma.payment.update({
      where: { id: req.params.id },
      data: {
        status: (body.status as never) ?? undefined,
        method: (body.method as never) ?? undefined,
        paidAt:
          body.status === 'PAID'
            ? new Date()
            : body.paid_at
              ? new Date(String(body.paid_at))
              : undefined,
        voidReason: (body.void_reason as string) ?? undefined,
        amountCents: body.amount_cents ? Number(body.amount_cents) : undefined,
      },
      include: paymentInclude,
    });
    res.json(toSnakeCase(toRoleScopedPaymentDto(req.user!.role, payment)));
  }),
};

export const messageController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const { userId } = req.user!;
    const patientId = req.query.patient_id ? String(req.query.patient_id) : undefined;

    const messages = await prisma.message.findMany({
      where: {
        practiceId,
        ...(patientId ? { patientId } : {}),
        OR: [
          {
            type: MessageType.CHAT,
            OR: [{ senderId: userId }, { recipientId: userId }],
          },
          {
            type: MessageType.SYSTEM,
            recipientId: userId,
          },
        ],
      },
      include: messageInclude,
      orderBy: { createdAt: 'asc' },
    });
    res.json(toSnakeCase(messages.map((message) => toRoleScopedMessageDto(req.user!.role, message))));
  }),

  unreadCount: asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const count = await prisma.message.count({
      where: {
        practiceId,
        recipientId: req.user!.userId,
        readAt: null,
      },
    });
    res.json({ count });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const body = req.body as Record<string, unknown>;
    const recipientId = String(body.recipient_id);
    const patientId = String(body.patient_id);
    const text = String(body.body ?? '').trim();
    if (!text) throw new AppError(400, 'Message body is required');

    const recipient = await prisma.profile.findFirst({
      where: { id: recipientId, practiceId },
    });
    if (!recipient || !recipient.isActive || recipient.softDeletedAt) {
      throw new AppError(404, 'Recipient not found');
    }

    if (!isAllowedChatPair(req.user!.role, recipient.role)) {
      throw new AppError(403, 'Messaging between these roles is not allowed');
    }

    const patient = await prisma.patient.findFirst({
      where: { id: patientId, practiceId, softDeletedAt: null },
    });
    if (!patient) throw new AppError(404, 'Patient not found');

    if (req.user!.role === UserRole.PATIENT) {
      if (patient.profileId !== req.user!.userId) {
        throw new AppError(403, 'Access denied');
      }
    }

    if (req.user!.role === UserRole.ADMIN && recipient.role === UserRole.PATIENT) {
      if (recipient.id !== patient.profileId) {
        throw new AppError(400, 'Recipient must be the patient for this conversation');
      }
    }

    if (req.user!.role === UserRole.PATIENT && recipient.role === UserRole.ADMIN) {
      // allowed — admin reception chat
    }

    const message = await prisma.message.create({
      data: {
        practiceId,
        senderId: req.user!.userId,
        recipientId,
        patientId,
        body: text,
        type: 'CHAT',
      },
      include: messageInclude,
    });
    res.status(201).json(toSnakeCase(toRoleScopedMessageDto(req.user!.role, message)));
  }),

  startAdmin: asyncHandler(async (req: Request, res: Response) => {
    if (req.user!.role !== UserRole.PATIENT) {
      throw new AppError(403, 'Only patients can start an admin chat');
    }
    const { practiceId } = tenantWhere(req);
    const result = await startAdminChat(req.user!.userId, practiceId);
    res.json(
      toSnakeCase({
        ...result,
        admin: toSafeProfile(result.admin),
        patient: toRoleScopedMessageDto(req.user!.role, { patient: result.patient }).patient,
      })
    );
  }),

  markRead: asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const existing = await prisma.message.findFirst({
      where: { id: req.params.id, practiceId },
    });
    if (!existing) throw new AppError(404, 'Message not found');
    if (existing.recipientId !== req.user!.userId) {
      throw new AppError(403, 'Only the recipient can mark a message as read');
    }

    const message = await prisma.message.update({
      where: { id: req.params.id },
      data: { readAt: new Date() },
      include: messageInclude,
    });
    res.json(toSnakeCase(toRoleScopedMessageDto(req.user!.role, message)));
  }),
};

export const auditController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const where: Record<string, unknown> = { practiceId };
    if (req.query.action) where.action = String(req.query.action);
    if (req.query.resource) where.resource = String(req.query.resource);
    if (req.query.patient_id) where.patientId = String(req.query.patient_id);

    const logs = await prisma.auditLog.findMany({
      where,
      include: { actor: { select: {
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
      } } },
      orderBy: { createdAt: 'desc' },
      take: req.query.limit ? Number(req.query.limit) : 200,
    });
    res.json(toSnakeCase(logs.map((log) => ({ ...log, actor: toSafeProfile(log.actor) }))));
  }),

  /** Client-forged audits are disabled — use server-side logAudit only. */
  create: asyncHandler(async (_req: Request, res: Response) => {
    throw new AppError(403, 'Audit logs are server-authored only');
  }),
};

export const telemedicineConsentController = {
  getForPatient: asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    await assertPatientAccess(
      req.user!.userId,
      req.user!.role,
      req.params.patientId,
      practiceId
    );
    const consent = await prisma.telemedicineConsent.findFirst({
      where: { patientId: req.params.patientId, practiceId },
      orderBy: { signedAt: 'desc' },
    });
    res.json(toSnakeCase(consent));
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const body = req.body as Record<string, unknown>;
    const patientId = String(body.patient_id);
    const role = req.user!.role;

    await assertPatientAccess(req.user!.userId, role, patientId, practiceId);

    // Patients may create their own consent; admins may record with audit; doctors cannot forge.
    if (role === UserRole.DOCTOR) {
      throw new AppError(403, 'Doctors cannot create telemedicine consent on behalf of patients');
    }
    if (role === UserRole.PATIENT) {
      const selfId = await getPatientIdForProfile(req.user!.userId, practiceId);
      if (selfId !== patientId) throw new AppError(403, 'Access denied');
    }

    const consent = await prisma.telemedicineConsent.create({
      data: {
        practiceId,
        patientId,
        consentGiven: Boolean(body.consent_given),
        consentTextHash: (body.consent_text_hash as string) ?? null,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        signedAt: new Date(),
      },
    });
    if (role === UserRole.ADMIN) {
      await logAudit({
        practiceId,
        actorId: req.user!.userId,
        action: 'TELEMEDICINE_CONSENT_RECORDED',
        resource: 'telemedicine_consent',
        resourceId: consent.id,
        patientId,
        newValue: { consent_given: consent.consentGiven },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
    }

    res.status(201).json(toSnakeCase(consent));
  }),
};

export const dashboardController = {
  adminStats: asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const [appointments, patients, unpaidPayments] = await Promise.all([
      prisma.appointment.count({ where: { softDeletedAt: null, practiceId } }),
      prisma.patient.count({ where: { softDeletedAt: null, practiceId } }),
      prisma.payment.count({ where: { status: 'UNPAID', practiceId } }),
    ]);
    res.json(toSnakeCase({ appointments, patients, unpaidPayments }));
  }),
};
