import { Request, Response } from 'express';
import { RecordingConsentMode, UserRole } from '@prisma/client';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { tenantWhere } from '../middleware/tenant';
import { createRecordingConsent } from '../services/recordingConsentService';
import { toSnakeCase } from '../utils/serialize';

export const recordingConsentController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    if (req.user!.role !== UserRole.DOCTOR) {
      throw new AppError(403, 'Only doctors may record consultation recording consent');
    }

    const { practiceId } = tenantWhere(req);
    const body = req.body as Record<string, unknown>;
    const patientId = String(body.patient_id || '');
    const modeRaw = String(body.consent_mode || 'CONSULTATION').toUpperCase();
    if (modeRaw !== 'CONSULTATION' && modeRaw !== 'DICTATION') {
      throw new AppError(400, 'consent_mode must be CONSULTATION or DICTATION');
    }

    const consent = await createRecordingConsent({
      practiceId,
      actorUserId: req.user!.userId,
      role: req.user!.role,
      patientId,
      medicalRecordId: body.medical_record_id ? String(body.medical_record_id) : null,
      appointmentId: body.appointment_id ? String(body.appointment_id) : null,
      consentMode: modeRaw as RecordingConsentMode,
      consentTextHash: body.consent_text_hash ? String(body.consent_text_hash) : null,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
    });

    res.status(201).json(
      toSnakeCase({
        id: consent.id,
        patientId: consent.patientId,
        doctorId: consent.doctorId,
        consentMode: consent.consentMode,
        consentedAt: consent.consentedAt,
      })
    );
  }),
};
