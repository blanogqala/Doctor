import { Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { prisma } from '../config/database';
import { toSnakeCase } from '../utils/serialize';
import { toSafeProfile } from '../utils/safeProfile';
import { toRoleScopedPatientDto } from '../utils/patientDto';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { patientInclude, doctorInclude } from '../utils/includes';
import { assertPatientAccess } from '../services/accessService';
import { tenantWhere } from '../middleware/tenant';
import { activeDoctorWhere, assertActiveDoctorInPractice } from '../services/activeDoctor';

export const patientController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const { role, userId } = req.user!;
    const { practiceId } = tenantWhere(req);
    const where =
      role === 'ADMIN'
        ? { softDeletedAt: null, practiceId }
        : role === 'DOCTOR'
          ? {
              softDeletedAt: null,
              practiceId,
              assignedDoctor: { profileId: userId, practiceId },
            }
          : { profileId: userId, softDeletedAt: null, practiceId };

    const patients = await prisma.patient.findMany({
      where,
      include: patientInclude,
      orderBy: { createdAt: 'desc' },
    });
    res.json(toSnakeCase(patients.map((patient) => toRoleScopedPatientDto(role, patient))));
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
      select: { id: true, profileId: true, softDeletedAt: true },
    });
    if (!patient || patient.softDeletedAt) throw new AppError(404, 'Patient not found');

    // Role-based field allowlists
    if (role === UserRole.PATIENT) {
      const forbidden = [
        'assigned_doctor_id',
        'medical_history',
        'allergies',
        'current_medications',
        'id_number',
        'email',
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

    if (body.assigned_doctor_id) {
      await assertActiveDoctorInPractice(prisma, String(body.assigned_doctor_id), practiceId, {
        inactiveMessage: 'This Doctor is inactive and cannot receive new patient assignments.',
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const canEditProfile =
        role === UserRole.ADMIN ||
        role === UserRole.DOCTOR ||
        (role === UserRole.PATIENT && (body.full_name || body.phone));

      if (canEditProfile && (body.full_name || body.email || body.phone)) {
        await tx.profile.update({
          where: { id: patient.profileId },
          data: {
            fullName: (body.full_name as string) ?? undefined,
            email:
              role === UserRole.ADMIN || role === UserRole.DOCTOR
                ? ((body.email as string) ?? undefined)
                : undefined,
            phone: (body.phone as string) ?? undefined,
          },
        });
      }

      const clinicalAllowed = role === UserRole.ADMIN || role === UserRole.DOCTOR;

      return tx.patient.update({
        where: { id: patient.id },
        data: {
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

    res.json(toSnakeCase(toRoleScopedPatientDto(role, updated)));
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
    await prisma.profile.update({
      where: { id: patient.profileId },
      data: { softDeletedAt: now },
    });
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
    const existing = await prisma.profile.findUnique({
      where: { practiceId_email: { practiceId, email } },
    });
    res.json({ exists: !!existing });
  }),
};
