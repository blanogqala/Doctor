import { Request, Response } from 'express';
import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../config/database';
import { toSnakeCase } from '../utils/serialize';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { appointmentInclude } from '../utils/includes';
import { safeProfileRelation } from '../utils/safeProfile';
import { toRoleScopedAppointmentDto } from '../utils/patientDto';
import { tenantWhere } from '../middleware/tenant';
import {
  getDoctorIdForProfile,
  getPatientIdForProfile,
  assertAppointmentAccess,
  assertPatientAccess,
} from '../services/accessService';
import {
  notifyAppointmentBooked,
  notifyCheckUpBooked,
  notifyTelemedicineDecision,
} from '../services/messageService';
import { logAudit } from '../services/auditService';
import {
  assertSlotAvailable,
  cascadeDelayOnComplete,
  generateSlots,
  DEFAULT_DURATION_MINUTES,
} from '../services/schedulingService';
import { assertActiveDoctorInPractice } from '../services/activeDoctor';
import { createReceptionPatientWithAppointment } from '../services/receptionPatientService';

function buildAppointmentWhere(req: Request) {
  const { role, userId } = req.user!;
  const { practiceId } = tenantWhere(req);
  const base = { softDeletedAt: null, practiceId } as Record<string, unknown>;

  if (req.query.doctor_id) base.doctorId = String(req.query.doctor_id);
  if (req.query.patient_id) base.patientId = String(req.query.patient_id);
  if (req.query.status) base.status = String(req.query.status);
  if (req.query.type) base.type = String(req.query.type);
  if (req.query.from || req.query.to) {
    base.scheduledAt = {
      ...(req.query.from ? { gte: new Date(String(req.query.from)) } : {}),
      ...(req.query.to ? { lt: new Date(String(req.query.to)) } : {}),
    };
  }
  if (req.query.gte) {
    base.scheduledAt = { ...(base.scheduledAt as object), gte: new Date(String(req.query.gte)) };
  }

  if (role === UserRole.DOCTOR) {
    return { ...base, doctor: { profileId: userId, practiceId } };
  }
  if (role === UserRole.PATIENT) {
    return { ...base, patient: { profileId: userId, practiceId } };
  }
  return base;
}

async function assertDoctorInPractice(doctorId: string, practiceId: string) {
  return assertActiveDoctorInPractice(prisma, doctorId, practiceId);
}

export const appointmentController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const appointments = await prisma.appointment.findMany({
      where: buildAppointmentWhere(req),
      include: appointmentInclude,
      orderBy: { scheduledAt: 'desc' },
    });
    res.json(
      toSnakeCase(appointments.map((appointment) => toRoleScopedAppointmentDto(req.user!.role, appointment)))
    );
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    await assertAppointmentAccess(req.user!.userId, req.user!.role, req.params.id, practiceId);
    const appointment = await prisma.appointment.findFirst({
      where: { id: req.params.id, practiceId, softDeletedAt: null },
      include: appointmentInclude,
    });
    if (!appointment) {
      throw new AppError(404, 'Appointment not found');
    }
    res.json(toSnakeCase(toRoleScopedAppointmentDto(req.user!.role, appointment)));
  }),

  count: asyncHandler(async (req: Request, res: Response) => {
    const where = buildAppointmentWhere(req);
    const count = await prisma.appointment.count({ where });
    res.json({ count });
  }),

  slots: asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const doctorId = String(req.query.doctor_id || '');
    const date = String(req.query.date || '');
    if (!doctorId || !date) {
      throw new AppError(400, 'doctor_id and date are required');
    }
    await assertDoctorInPractice(doctorId, practiceId);
    const duration = req.query.duration_minutes
      ? Number(req.query.duration_minutes)
      : DEFAULT_DURATION_MINUTES;
    const excludeId = req.query.exclude_id ? String(req.query.exclude_id) : undefined;
    const slots = await generateSlots({
      doctorId,
      date,
      durationMinutes: duration,
      excludeAppointmentId: excludeId,
    });
    res.json(slots);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const body = req.body as Record<string, unknown>;
    const role = req.user!.role;
    let doctorId = String(body.doctor_id ?? '');
    let patientId = String(body.patient_id ?? '');
    const newPatient = (body.new_patient as { first_name?: string; last_name?: string } | undefined) ?? undefined;
    const scheduledAt = new Date(String(body.scheduled_at));
    const durationMinutes = Number(body.duration_minutes ?? DEFAULT_DURATION_MINUTES);
    const notes =
      role === UserRole.ADMIN || role === UserRole.DOCTOR ? ((body.notes as string) ?? null) : null;

    if (role === UserRole.PATIENT) {
      const selfPatientId = await getPatientIdForProfile(req.user!.userId, practiceId);
      if (!selfPatientId) throw new AppError(403, 'Patient profile required');
      patientId = selfPatientId;
    } else if (role === UserRole.DOCTOR) {
      const selfDoctorId = await getDoctorIdForProfile(req.user!.userId, practiceId);
      if (!selfDoctorId) throw new AppError(403, 'Doctor profile required');
      doctorId = selfDoctorId;
      await assertPatientAccess(req.user!.userId, role, patientId, practiceId);
    } else if (role === UserRole.ADMIN) {
      // Admin may schedule for any practice patient/doctor, or create a telephone patient atomically.
    } else {
      throw new AppError(403, 'Insufficient permissions');
    }

    if (!doctorId) {
      throw new AppError(400, 'doctor_id is required');
    }

    await assertDoctorInPractice(doctorId, practiceId);
    await assertSlotAvailable({ doctorId, scheduledAt, durationMinutes });

    if (role === UserRole.ADMIN && newPatient && !body.patient_id) {
      const appointment = await createReceptionPatientWithAppointment({
        practiceId,
        actorId: req.user!.userId,
        firstName: String(newPatient.first_name ?? ''),
        lastName: String(newPatient.last_name ?? ''),
        doctorId,
        scheduledAt,
        durationMinutes,
        type: body.type as string | undefined,
        status: (body.status as string) ?? undefined,
        reason: (body.reason as string) ?? null,
        notes,
      });
      try {
        await notifyAppointmentBooked(appointment.id);
      } catch (err) {
        console.error('[appointments] failed to send booking notifications:', err);
      }
      res.status(201).json(toSnakeCase(toRoleScopedAppointmentDto(role, appointment)));
      return;
    }

    if (!patientId) {
      throw new AppError(400, 'doctor_id and patient_id are required');
    }

    const patient = await prisma.patient.findFirst({
      where: { id: patientId, practiceId, softDeletedAt: null },
    });
    if (!patient) throw new AppError(400, 'Invalid patient for this practice');

    const appointment = await prisma.appointment.create({
      data: {
        practiceId,
        patientId,
        doctorId,
        createdBy: req.user!.userId,
        scheduledAt,
        durationMinutes,
        type: body.type as never,
        status: (body.status as never) ?? 'PENDING',
        reason: (body.reason as string) ?? null,
        notes,
      },
      include: appointmentInclude,
    });

    try {
      await notifyAppointmentBooked(appointment.id);
    } catch (err) {
      console.error('[appointments] failed to send booking notifications:', err);
    }

    res.status(201).json(toSnakeCase(toRoleScopedAppointmentDto(role, appointment)));
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const role = req.user!.role;
    await assertAppointmentAccess(req.user!.userId, role, req.params.id, practiceId);
    const body = req.body as Record<string, unknown>;

    const existing = await prisma.appointment.findFirst({
      where: { id: req.params.id, practiceId },
    });
    if (!existing || existing.softDeletedAt) {
      throw new AppError(404, 'Appointment not found');
    }

    // Per-role field allowlists
    if (role === UserRole.PATIENT) {
      const allowed = new Set([
        'status',
        'cancellation_reason',
        'reason',
        'patient_joined_at',
        'scheduled_at',
        'duration_minutes',
      ]);
      for (const key of Object.keys(body)) {
        if (!allowed.has(key)) {
          throw new AppError(403, `Patients cannot update field: ${key}`);
        }
      }
      if (body.status !== undefined) {
        const status = String(body.status);
        // Patients may cancel; other status transitions are staff/doctor only
        if (status !== 'CANCELLED' && status !== existing.status) {
          throw new AppError(403, 'Patients may only cancel appointments');
        }
      }
    } else if (role === UserRole.DOCTOR) {
      const forbidden = new Set(['patient_id', 'soft_deleted_at']);
      for (const key of Object.keys(body)) {
        if (forbidden.has(key)) {
          throw new AppError(403, `Doctors cannot update field: ${key}`);
        }
      }
    }
    // ADMIN: full scheduling fields allowed within practice

    const nextDoctorId = (body.doctor_id as string) ?? existing.doctorId;
    const nextScheduledAt = body.scheduled_at
      ? new Date(String(body.scheduled_at))
      : existing.scheduledAt;
    const nextDuration = body.duration_minutes
      ? Number(body.duration_minutes)
      : existing.durationMinutes;
    const nextStatus = (body.status as string) ?? existing.status;

    if (body.doctor_id !== undefined) {
      await assertDoctorInPractice(String(body.doctor_id), practiceId);
    }
    if (body.patient_id !== undefined) {
      if (role !== UserRole.ADMIN) {
        throw new AppError(403, 'Only administrators can reassign patients');
      }
      const patient = await prisma.patient.findFirst({
        where: { id: String(body.patient_id), practiceId, softDeletedAt: null },
      });
      if (!patient) throw new AppError(400, 'Invalid patient for this practice');
    }

    const scheduleChanging =
      Boolean(body.scheduled_at) ||
      Boolean(body.duration_minutes) ||
      Boolean(body.doctor_id);

    // New slot work (reschedule/reassign) requires an active Doctor even if doctor_id is unchanged.
    if (
      scheduleChanging &&
      !['CANCELLED', 'CANCELLED_NO_SHOW', 'NO_SHOW', 'COMPLETED'].includes(nextStatus)
    ) {
      if (body.doctor_id === undefined) {
        await assertDoctorInPractice(nextDoctorId, practiceId);
      }
      await assertSlotAvailable({
        doctorId: nextDoctorId,
        scheduledAt: nextScheduledAt,
        durationMinutes: nextDuration,
        excludeAppointmentId: existing.id,
      });
    }

    const data: Prisma.AppointmentUpdateInput = {};

    if (body.patient_id !== undefined && role === UserRole.ADMIN) {
      data.patient = { connect: { id: String(body.patient_id) } };
    }
    if (body.doctor_id !== undefined) {
      data.doctor = { connect: { id: String(body.doctor_id) } };
    }
    if (body.scheduled_at !== undefined) {
      data.scheduledAt = new Date(String(body.scheduled_at));
    }
    if (body.duration_minutes !== undefined) {
      data.durationMinutes = Number(body.duration_minutes);
    }
    if (body.type !== undefined) {
      data.type = body.type as never;
    }
    if (body.status !== undefined) {
      data.status = body.status as never;
    }
    if (body.reason !== undefined) {
      data.reason = body.reason as string | null;
    }
    if (body.cancellation_reason !== undefined) {
      data.cancellationReason = body.cancellation_reason as string | null;
    }
    if (body.notes !== undefined && role !== UserRole.PATIENT) {
      data.notes = body.notes as string | null;
    }
    if (body.locked_by_doctor_id !== undefined && role !== UserRole.PATIENT) {
      data.lockedByDoctor =
        body.locked_by_doctor_id === null
          ? { disconnect: true }
          : { connect: { id: String(body.locked_by_doctor_id) } };
    }
    if (body.doctor_joined_at !== undefined && role !== UserRole.PATIENT) {
      data.doctorJoinedAt =
        body.doctor_joined_at === null ? null : new Date(String(body.doctor_joined_at));
    }
    if (body.patient_joined_at !== undefined) {
      data.patientJoinedAt =
        body.patient_joined_at === null ? null : new Date(String(body.patient_joined_at));
    }
    if (body.soft_deleted_at !== undefined && role === UserRole.ADMIN) {
      data.softDeletedAt = body.soft_deleted_at
        ? new Date(String(body.soft_deleted_at))
        : null;
    }

    if (nextStatus === 'IN_CONSULTATION' && existing.status !== 'IN_CONSULTATION') {
      data.consultationStartedAt = existing.consultationStartedAt ?? new Date();
      if (data.doctorJoinedAt === undefined && !existing.doctorJoinedAt) {
        data.doctorJoinedAt = new Date();
      }
    }

    if (nextStatus === 'COMPLETED' && existing.status !== 'COMPLETED') {
      data.doctorJoinedAt = null;
      data.patientJoinedAt = null;
    }

    const appointment = await prisma.appointment.update({
      where: { id: req.params.id },
      data,
      include: appointmentInclude,
    });

    if (nextStatus === 'COMPLETED' && existing.status !== 'COMPLETED') {
      try {
        await cascadeDelayOnComplete(appointment.id);
      } catch (err) {
        console.error('[appointments] delay cascade failed:', err);
      }
    }

    const refreshed = await prisma.appointment.findFirst({
      where: { id: appointment.id, practiceId },
      include: appointmentInclude,
    });
    res.json(toSnakeCase(toRoleScopedAppointmentDto(role, refreshed ?? appointment)));
  }),

  dashboardStats: asyncHandler(async (req: Request, res: Response) => {
    const { role, userId } = req.user!;
    const { practiceId } = tenantWhere(req);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    let where: Record<string, unknown> = { softDeletedAt: null, practiceId };

    if (role === UserRole.DOCTOR) {
      const doctorId = await getDoctorIdForProfile(userId, practiceId);
      where = { ...where, doctorId };
    } else if (role === UserRole.PATIENT) {
      const patientId = await getPatientIdForProfile(userId, practiceId);
      where = { ...where, patientId };
    }

    const [todayCount, pendingCount, recent] = await Promise.all([
      prisma.appointment.count({
        where: {
          ...where,
          scheduledAt: { gte: todayStart, lte: todayEnd },
        },
      }),
      prisma.appointment.count({
        where: {
          ...where,
          status: {
            in: [
              'PENDING',
              'PENDING_IN_PERSON',
              'CONFIRMED',
              'CONFIRMED_IN_PERSON',
              'CONFIRMED_TELEMEDICINE',
              'ARRIVED',
            ],
          },
        },
      }),
      prisma.appointment.findMany({
        where,
        include: appointmentInclude,
        orderBy: { scheduledAt: 'desc' },
        take: 5,
      }),
    ]);

    res.json(
      toSnakeCase({
        todayCount,
        pendingCount,
        recent: recent.map((appointment) => toRoleScopedAppointmentDto(role, appointment)),
      })
    );
  }),

  createCheckUp: asyncHandler(async (req: Request, res: Response) => {
    if (req.user!.role !== UserRole.ADMIN && req.user!.role !== UserRole.DOCTOR) {
      throw new AppError(403, 'Only admin or doctor can book check-ups');
    }

    const { practiceId } = tenantWhere(req);
    const body = req.body as Record<string, unknown>;
    const parentRecordId = String(body.parent_record_id || '');
    const patientId = String(body.patient_id || '');
    const doctorId = String(body.doctor_id || '');
    const scheduledAt = new Date(String(body.scheduled_at));
    const durationMinutes = Number(body.duration_minutes ?? DEFAULT_DURATION_MINUTES);
    const type = String(body.type || 'IN_PERSON') as 'IN_PERSON' | 'TELEMEDICINE';
    const reason = String(body.reason || 'check-up').trim() || 'check-up';

    if (!parentRecordId || !patientId || !doctorId || Number.isNaN(scheduledAt.getTime())) {
      throw new AppError(400, 'parent_record_id, patient_id, doctor_id, and scheduled_at are required');
    }

    await assertPatientAccess(req.user!.userId, req.user!.role, patientId, practiceId);
    await assertDoctorInPractice(doctorId, practiceId);

    const parent = await prisma.medicalRecord.findFirst({
      where: { id: parentRecordId, practiceId, softDeletedAt: null },
    });
    if (!parent) throw new AppError(404, 'Parent medical record not found');
    if (parent.patientId !== patientId) {
      throw new AppError(400, 'Parent record does not belong to this patient');
    }
    if (parent.parentRecordId) {
      throw new AppError(400, 'Cannot book a check-up against another check-up record');
    }

    await assertSlotAvailable({ doctorId, scheduledAt, durationMinutes });

    const isTelemedicine = type === 'TELEMEDICINE';

    const result = await prisma.$transaction(async (tx) => {
      const appointment = await tx.appointment.create({
        data: {
          practiceId,
          patientId,
          doctorId,
          createdBy: req.user!.userId,
          scheduledAt,
          durationMinutes,
          type,
          status: isTelemedicine ? 'CONFIRMED_TELEMEDICINE' : 'CONFIRMED_IN_PERSON',
          reason,
          parentRecordId,
          patientTelemedicineDecision: isTelemedicine ? 'PENDING' : null,
        },
      });

      const childRecord = await tx.medicalRecord.create({
        data: {
          practiceId,
          patientId,
          doctorId,
          appointmentId: appointment.id,
          parentRecordId,
          recordDate: scheduledAt,
          chiefComplaint: reason,
          subjective: reason,
          isDraft: true,
        },
      });

      return { appointmentId: appointment.id, childRecordId: childRecord.id };
    });

    try {
      await notifyCheckUpBooked(result.appointmentId, isTelemedicine);
    } catch (err) {
      console.error('[appointments] failed to send check-up notifications:', err);
    }

    await logAudit({
      practiceId,
      actorId: req.user!.userId,
      action: 'CHECKUP_BOOKED',
      resource: 'appointment',
      resourceId: result.appointmentId,
      patientId,
      newValue: {
        parentRecordId,
        childRecordId: result.childRecordId,
        type,
        scheduledAt: scheduledAt.toISOString(),
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    const appointment = await prisma.appointment.findFirstOrThrow({
      where: { id: result.appointmentId, practiceId },
      include: appointmentInclude,
    });
    const childRecord = await prisma.medicalRecord.findFirstOrThrow({
      where: { id: result.childRecordId, practiceId },
      include: {
        doctor: { include: { profile: safeProfileRelation } },
        appointment: true,
      },
    });

    res.status(201).json(
      toSnakeCase({
        appointment: toRoleScopedAppointmentDto(req.user!.role, appointment),
        medical_record: childRecord,
      })
    );
  }),

  confirmTelemedicine: asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const appointmentId = req.params.id;
    const decision = String(req.body?.decision || '').toUpperCase();
    if (decision !== 'ACCEPTED_VIDEO' && decision !== 'SWITCHED_IN_PERSON') {
      throw new AppError(400, 'decision must be ACCEPTED_VIDEO or SWITCHED_IN_PERSON');
    }

    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, practiceId },
      include: { patient: true, doctor: { include: { profile: safeProfileRelation } } },
    });
    if (!appointment || appointment.softDeletedAt) {
      throw new AppError(404, 'Appointment not found');
    }
    if (appointment.type !== 'TELEMEDICINE') {
      throw new AppError(400, 'Appointment is not a telemedicine booking');
    }
    const existingDecision = appointment.patientTelemedicineDecision;
    if (existingDecision === 'ACCEPTED_VIDEO' || existingDecision === 'SWITCHED_IN_PERSON') {
      throw new AppError(400, 'Telemedicine decision was already recorded');
    }
    // PENDING or null (legacy/inconsistent rows) can still be decided.

    const { role, userId } = req.user!;
    if (role === UserRole.PATIENT) {
      const patientId = await getPatientIdForProfile(userId, practiceId);
      if (patientId !== appointment.patientId) {
        throw new AppError(403, 'Not your appointment');
      }
    } else if (role !== UserRole.ADMIN && role !== UserRole.DOCTOR) {
      throw new AppError(403, 'Not allowed');
    } else {
      await assertAppointmentAccess(userId, role, appointmentId, practiceId);
    }

    if (decision === 'ACCEPTED_VIDEO') {
      const existingConsent = await prisma.telemedicineConsent.findFirst({
        where: { patientId: appointment.patientId, practiceId, consentGiven: true },
        orderBy: { signedAt: 'desc' },
      });
      if (!existingConsent) {
        await prisma.telemedicineConsent.create({
          data: {
            practiceId,
            patientId: appointment.patientId,
            consentGiven: true,
            consentTextHash: 'checkup-telemedicine-confirm',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            signedAt: new Date(),
          },
        });
      }
      await prisma.patient.update({
        where: { id: appointment.patientId },
        data: { consentTelemedicine: true },
      });
    }

    const updated = await prisma.appointment.update({
      where: { id: appointmentId },
      data:
        decision === 'ACCEPTED_VIDEO'
          ? {
              patientTelemedicineDecision: 'ACCEPTED_VIDEO',
              patientTelemedicineDecidedAt: new Date(),
              type: 'TELEMEDICINE',
              status: 'CONFIRMED_TELEMEDICINE',
            }
          : {
              patientTelemedicineDecision: 'SWITCHED_IN_PERSON',
              patientTelemedicineDecidedAt: new Date(),
              type: 'IN_PERSON',
              status: 'CONFIRMED_IN_PERSON',
            },
      include: appointmentInclude,
    });

    try {
      await notifyTelemedicineDecision(appointmentId, decision);
    } catch (err) {
      console.error('[appointments] failed to notify telemedicine decision:', err);
    }

    await logAudit({
      practiceId,
      actorId: req.user!.userId,
      action: 'TELEMEDICINE_DECISION',
      resource: 'appointment',
      resourceId: appointmentId,
      patientId: appointment.patientId,
      newValue: { decision },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json(toSnakeCase(toRoleScopedAppointmentDto(role, updated)));
  }),
};
