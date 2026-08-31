import { Request, Response } from 'express';
import { PatientPortalStatus, UserRole } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../config/database';
import { toSnakeCase } from '../utils/serialize';
import { toSafeProfile } from '../utils/safeProfile';
import { toRoleScopedPatientDto } from '../utils/patientDto';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { patientInclude, doctorInclude } from '../utils/includes';
import { assertPatientAccess } from '../services/accessService';
import { tenantWhere } from '../middleware/tenant';
import { activeDoctorWhere, assertActiveDoctorInPractice } from '../services/activeDoctor';
import {
  createReceptionPatient,
  listPracticePatients,
} from '../services/receptionPatientService';
import { assertPatientEmailAvailable } from '../services/patientEmailUniqueness';
import {
  sendPatientPortalInvitation,
} from '../services/patientPortalInvitationService';
import { sendPatientActivationEmail } from '../services/emailService';
import { buildUatActivationUrlIfEnabled } from '../config/uatActivationLinks';
import { logAudit } from '../services/auditService';
import { joinPersonName } from '../utils/personName';

const createReceptionPatientSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required'),
  last_name: z.string().trim().min(1, 'Surname is required'),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  patient: z.record(z.unknown()).optional(),
});

export const patientController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const { role, userId } = req.user!;
    const { practiceId } = tenantWhere(req);
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const patients = await listPracticePatients({ practiceId, role, userId, q });
    res.json(toSnakeCase(patients.map((patient) => toRoleScopedPatientDto(role, patient))));
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const body = createReceptionPatientSchema.parse(req.body);
    const { practiceId } = tenantWhere(req);
    const created = await createReceptionPatient(
      {
        firstName: body.first_name,
        lastName: body.last_name,
        email: body.email || null,
        phone: body.phone,
        patient: body.patient,
      },
      practiceId,
      req.user!.userId
    );
    res.status(201).json(toSnakeCase(toRoleScopedPatientDto(req.user!.role, created)));
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    await assertPatientAccess(req.user!.userId, req.user!.role, req.params.id, practiceId);
    const patient = await prisma.patient.findFirst({
      where: { id: req.params.id, practiceId, softDeletedAt: null },
      include: patientInclude,
    });
    if (!patient) throw new AppError(404, 'Patient not found');
    res.json(toSnakeCase(toRoleScopedPatientDto(req.user!.role, patient)));
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const { practiceId } = tenantWhere(req);
    const role = req.user!.role;
    await assertPatientAccess(req.user!.userId, role, req.params.id, practiceId);

    const patient = await prisma.patient.findFirst({
      where: { id: req.params.id, practiceId },
      select: { id: true, profileId: true, softDeletedAt: true, registrationSource: true },
    });
    if (!patient || patient.softDeletedAt) throw new AppError(404, 'Patient not found');

    if (role === UserRole.PATIENT) {
      const forbidden = [
        'assigned_doctor_id',
        'medical_history',
        'allergies',
        'current_medications',
        'id_number',
        'email',
        'registration_source',
        'portal_status',
      ];
      for (const key of forbidden) {
        if (body[key] !== undefined) {
          throw new AppError(403, `Patients cannot update field: ${key}`);
        }
      }
    }

    if (body.assigned_doctor_id && role !== UserRole.ADMIN && role !== UserRole.DOCTOR) {
      throw new AppError(403, 'Insufficient permissions to assign doctor');
    }

    if (
      role === UserRole.ADMIN &&
      (body.medical_history !== undefined ||
        body.allergies !== undefined ||
        body.current_medications !== undefined)
    ) {
      throw new AppError(403, 'Reception cannot update clinical patient fields');
    }

    if (body.registration_source !== undefined) {
      throw new AppError(403, 'Patient origin cannot be changed');
    }

    if (body.assigned_doctor_id) {
      await assertActiveDoctorInPractice(prisma, String(body.assigned_doctor_id), practiceId, {
        inactiveMessage: 'This Doctor is inactive and cannot receive new patient assignments.',
      });
    }

    const firstName =
      body.first_name !== undefined ? String(body.first_name).trim() : undefined;
    const lastName = body.last_name !== undefined ? String(body.last_name).trim() : undefined;
    const email =
      role === UserRole.ADMIN || role === UserRole.DOCTOR
        ? body.email !== undefined
          ? String(body.email).trim() || null
          : undefined
        : undefined;
    const phone = body.phone !== undefined ? String(body.phone).trim() || null : undefined;
    const fullNameFromParts =
      firstName || lastName
        ? joinPersonName(firstName ?? '', lastName ?? '')
        : body.full_name
          ? String(body.full_name)
          : undefined;

    if (email) {
      await assertPatientEmailAvailable(prisma, {
        practiceId,
        email,
        excludePatientId: patient.id,
        excludeProfileId: patient.profileId ?? undefined,
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const canEditProfile =
        role === UserRole.ADMIN ||
        role === UserRole.DOCTOR ||
        (role === UserRole.PATIENT && (fullNameFromParts || body.phone));

      if (patient.profileId && canEditProfile && (fullNameFromParts || email !== undefined || phone !== undefined)) {
        await tx.profile.update({
          where: { id: patient.profileId },
          data: {
            fullName: fullNameFromParts || (body.full_name as string) || undefined,
            email: email === undefined || email === null ? undefined : email,
            phone: phone === undefined || phone === null ? undefined : phone,
          },
        });
      }

      const clinicalAllowed = role === UserRole.ADMIN || role === UserRole.DOCTOR;

      return tx.patient.update({
        where: { id: patient.id },
        data: {
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          email: email === undefined ? undefined : email,
          phone: phone === undefined ? undefined : phone,
          idNumber: clinicalAllowed ? ((body.id_number as string) ?? undefined) : undefined,
          idNumberLast4:
            body.id_number && clinicalAllowed ? String(body.id_number).slice(-4) : undefined,
          dateOfBirth: body.date_of_birth ? new Date(String(body.date_of_birth)) : undefined,
          gender: (body.gender as never) ?? undefined,
          address: (body.address as string) ?? undefined,
          city: (body.city as string) ?? undefined,
          medicalAidProvider: (body.medical_aid_provider as string) ?? undefined,
          medicalAidNumber: (body.medical_aid_number as string) ?? undefined,
          emergencyContactName: (body.emergency_contact_name as string) ?? undefined,
          emergencyContactPhone: (body.emergency_contact_phone as string) ?? undefined,
          assignedDoctorId: clinicalAllowed
            ? ((body.assigned_doctor_id as string) ?? undefined)
            : undefined,
          medicalHistory: clinicalAllowed
            ? ((body.medical_history as string) ?? undefined)
            : undefined,
          allergies: clinicalAllowed ? ((body.allergies as string) ?? undefined) : undefined,
          currentMedications: clinicalAllowed
            ? ((body.current_medications as string) ?? undefined)
            : undefined,
          consentTelemedicine:
            body.consent_telemedicine !== undefined
              ? Boolean(body.consent_telemedicine)
              : undefined,
        },
        include: patientInclude,
      });
    });

    await logAudit({
      practiceId,
      actorId: req.user!.userId,
      action: 'PATIENT_ADMIN_INFO_UPDATED',
      resource: 'PATIENT',
      resourceId: patient.id,
      patientId: patient.id,
    });

    res.json(toSnakeCase(toRoleScopedPatientDto(role, updated)));
  }),

  invitePortal: asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const isResend = /portal-invitations\/resend\/?(\?.*)?$/.test(req.originalUrl || req.path);
    const result = await sendPatientPortalInvitation({
      practiceId,
      patientId: req.params.id,
      actorId: req.user!.userId,
      isResend,
    });

    let emailDelivered = false;
    try {
      emailDelivered = await sendPatientActivationEmail({
        email: result.email,
        fullName: result.fullName,
        practiceName: result.clinicName,
        subdomain: result.subdomain,
        token: result.token,
        isResend,
      });
    } catch (err) {
      console.error('[patients] Portal invitation email failed:', err);
    }

    const payload: Record<string, unknown> = {
      invitation_issued: true,
      email_delivered: emailDelivered,
      portal_status: PatientPortalStatus.INVITED,
      invited_at: result.invitedAt,
      message: isResend ? 'Portal invitation resent.' : 'Portal invitation sent.',
    };
    const uatActivationUrl = buildUatActivationUrlIfEnabled(result.subdomain, result.token);
    if (uatActivationUrl) {
      payload.uat_activation_url = uatActivationUrl;
    }
    res.status(isResend ? 200 : 201).json(payload);
  }),

  softDelete: asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    await assertPatientAccess(req.user!.userId, req.user!.role, req.params.id, practiceId);
    const now = new Date();
    const existing = await prisma.patient.findFirst({
      where: { id: req.params.id, practiceId },
    });
    if (!existing) throw new AppError(404, 'Patient not found');

    const patient = await prisma.patient.update({
      where: { id: existing.id },
      data: { softDeletedAt: now },
      include: patientInclude,
    });
    if (patient.profileId) {
      await prisma.profile.update({
        where: { id: patient.profileId },
        data: { softDeletedAt: now },
      });
    }
    res.json(toSnakeCase(toRoleScopedPatientDto(req.user!.role, patient)));
  }),

  countMedicalRecords: asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    await assertPatientAccess(req.user!.userId, req.user!.role, req.params.id, practiceId);
    const count = await prisma.medicalRecord.count({
      where: { patientId: req.params.id, practiceId, softDeletedAt: null },
    });
    res.json({ count });
  }),
};

export const doctorController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const doctors = await prisma.doctor.findMany({
      where: activeDoctorWhere(practiceId),
      include: doctorInclude,
      orderBy: { practiceName: 'asc' },
    });
    res.json(toSnakeCase(doctors));
  }),
};

export const profileController = {
  update: asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const profile = await prisma.profile.update({
      where: { id: req.user!.userId },
      data: {
        fullName: (body.full_name as string) ?? undefined,
        phone: (body.phone as string) ?? undefined,
      },
    });
    res.json(toSnakeCase(toSafeProfile(profile)));
  }),

  checkEmail: asyncHandler(async (req: Request, res: Response) => {
    const email = String(req.query.email ?? '');
    const { practiceId } = tenantWhere(req);
    try {
      await assertPatientEmailAvailable(prisma, { practiceId, email });
      res.json({ exists: false });
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 409) {
        res.json({ exists: true });
        return;
      }
      throw err;
    }
  }),
};
