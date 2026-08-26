import { Request, Response } from 'express';
import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../config/database';
import { toSnakeCase } from '../utils/serialize';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { medicalRecordInclude } from '../utils/includes';
import { tenantWhere } from '../middleware/tenant';
import {
  getDoctorIdForProfile,
  getPatientIdForProfile,
  assertClinicalPatientAccess,
} from '../services/accessService';
import { logAudit, redactAuditPayload } from '../services/auditService';

import {
  consultationAudioExists,
  deleteConsultationAudioIfExists,
  openConsultationAudioStream,
  writeConsultationAudio,
} from '../services/consultationAudioStorage';
interface PrivateNote {
  id: string;
  heading: string;
  content: string;
  author_name: string;
  author_id?: string | null;
  created_at: string;
}

function normalizeDoctorNotesPrivate(
  raw: unknown
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (raw === undefined || raw === null) return Prisma.DbNull;
  if (typeof raw === 'string') {
    const content = raw.trim();
    if (!content) return Prisma.DbNull;
    return [
      {
        id: crypto.randomUUID(),
        heading: 'Private note',
        content,
        author_name: 'Doctor',
        created_at: new Date().toISOString(),
      },
    ];
  }
  if (Array.isArray(raw)) {
    const notes = (raw as Record<string, unknown>[])
      .filter((n) => n && typeof n === 'object')
      .map((n) => ({
        id: String(n.id ?? crypto.randomUUID()),
        heading: String(n.heading ?? 'Note'),
        content: String(n.content ?? ''),
        author_name: String(n.author_name ?? 'Doctor'),
        author_id: n.author_id ? String(n.author_id) : null,
        created_at: String(n.created_at ?? new Date().toISOString()),
      }))
      .filter((n) => n.content.trim());
    return notes.length ? notes : Prisma.DbNull;
  }
  return Prisma.DbNull;
}

function coerceNotesForResponse(raw: unknown): PrivateNote[] | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const content = raw.trim();
    if (!content) return null;
    return [
      {
        id: crypto.randomUUID(),
        heading: 'Private note',
        content,
        author_name: 'Doctor',
        created_at: new Date().toISOString(),
      },
    ];
  }
  if (Array.isArray(raw)) return raw as PrivateNote[];
  return null;
}

function withNormalizedNotes<T extends { doctorNotesPrivate?: unknown }>(record: T) {
  return {
    ...record,
    doctorNotesPrivate: coerceNotesForResponse(record.doctorNotesPrivate),
  };
}

type ScribeRecord = {
  scribeAudioPath?: string | null;
  scribeAudioMimeType?: string | null;
  scribeTranscript?: string | null;
  scribeDetectedLanguage?: string | null;
  scribeWarnings?: unknown;
  scribeConfidence?: unknown;
  scribeRecordedAt?: Date | null;
  scribeStatus?: string | null;
  aiFieldProvenance?: unknown;
};

/** Strip internal path; expose has_scribe_recording for doctors. */
function withScribePublicFields<T extends ScribeRecord>(record: T) {
  const {
    scribeAudioPath,
    scribeAudioMimeType: _mime,
    ...rest
  } = record;
  return {
    ...rest,
    hasScribeRecording: Boolean(scribeAudioPath),
  };
}

function stripScribeFieldsForPatient<T extends Record<string, unknown>>(record: T) {
  const {
    scribeAudioPath: _p,
    scribeAudioMimeType: _m,
    scribeTranscript: _t,
    scribeDetectedLanguage: _d,
    scribeWarnings: _w,
    scribeConfidence: _c,
    scribeRecordedAt: _r,
    scribeStatus: _s,
    aiFieldProvenance: _a,
    hasScribeRecording: _h,
    ...rest
  } = record as T & ScribeRecord & { hasScribeRecording?: boolean };
  return rest;
}

function toDoctorRecordResponse(record: ScribeRecord & { doctorNotesPrivate?: unknown }) {
  return toSnakeCase(withScribePublicFields(withNormalizedNotes(record)));
}

function toPatientRecordResponse(record: ScribeRecord & { doctorNotesPrivate?: unknown } & Record<string, unknown>) {
  const { doctorNotesPrivate: _, ...withoutNotes } = record;
  return toSnakeCase(stripScribeFieldsForPatient(withoutNotes as Record<string, unknown>));
}

async function requireDoctorId(userId: string, practiceId: string) {
  const doctorId = await getDoctorIdForProfile(userId, practiceId);
  if (!doctorId) throw new AppError(403, 'Doctor profile required');
  return doctorId;
}

function toAdminRecordMetadata(record: {
  id: string;
  practiceId: string;
  patientId: string;
  doctorId: string;
  appointmentId: string | null;
  parentRecordId: string | null;
  recordDate: Date;
  isDraft: boolean;
  isErroneous: boolean;
  followUpDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  softDeletedAt: Date | null;
}) {
  // Operational metadata only — no clinical PHI for practice ADMIN/reception.
  return toSnakeCase({
    id: record.id,
    practiceId: record.practiceId,
    patientId: record.patientId,
    doctorId: record.doctorId,
    appointmentId: record.appointmentId,
    parentRecordId: record.parentRecordId,
    recordDate: record.recordDate,
    isDraft: record.isDraft,
    isErroneous: record.isErroneous,
    followUpDate: record.followUpDate,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    softDeletedAt: record.softDeletedAt,
    subjective: null,
    objective: null,
    assessment: null,
    plan: null,
    diagnosisCodes: [],
    chiefComplaint: null,
    historyPresentIllness: null,
    reviewOfSystems: null,
    physicalExamination: null,
    vitalSigns: null,
    generalAppearance: null,
    primaryDiagnosis: null,
    differentialDiagnoses: null,
    severity: null,
    lifestyleAdvice: null,
    doctorNotesPrivate: null,
    hasScribeRecording: false,
    scribeTranscript: null,
    scribeStatus: null,
    aiFieldProvenance: null,
  });
}

async function buildMedicalRecordWhere(req: Request) {
  const { role, userId } = req.user!;
  const { practiceId } = tenantWhere(req);
  const base: Record<string, unknown> = { softDeletedAt: null, practiceId };

  if (req.query.patient_id) base.patientId = String(req.query.patient_id);
  if (req.query.doctor_id) base.doctorId = String(req.query.doctor_id);
  if (req.query.is_draft !== undefined) base.isDraft = req.query.is_draft === 'true';

  if (role === UserRole.ADMIN) {
    // Practice-scoped metadata only; controller redacts clinical fields.
    return base;
  }

  if (role === UserRole.DOCTOR) {
    const doctorId = await getDoctorIdForProfile(userId, practiceId);
    if (doctorId) base.doctorId = doctorId;
  } else if (role === UserRole.PATIENT) {
    const patientId = await getPatientIdForProfile(userId, practiceId);
    if (patientId) base.patientId = patientId;
    // Patients see published visits plus draft check-up children linked to a parent visit.
    delete base.isDraft;
    base.OR = [{ isDraft: false }, { parentRecordId: { not: null } }];
  }

  return base;
}

export const medicalRecordController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const records = await prisma.medicalRecord.findMany({
      where: await buildMedicalRecordWhere(req),
      include: medicalRecordInclude,
      orderBy: { recordDate: 'desc' },
    });

    const { role } = req.user!;
    if (role === UserRole.ADMIN) {
      return res.json(records.map((r) => toAdminRecordMetadata(r)));
    }

    const sanitized =
      role === UserRole.PATIENT
        ? records.map((r) => {
            const { doctorNotesPrivate: _, ...rest } = r;
            return stripScribeFieldsForPatient(rest as unknown as Record<string, unknown>);
          })
        : records.map((r) => withScribePublicFields(withNormalizedNotes(r)));

    res.json(toSnakeCase(sanitized));
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const record = await prisma.medicalRecord.findFirst({
      where: { id: req.params.id, practiceId, softDeletedAt: null },
      include: medicalRecordInclude,
    });
    if (!record) throw new AppError(404, 'Medical record not found');

    if (req.user!.role === UserRole.ADMIN) {
      return res.json(toAdminRecordMetadata(record));
    }

    await assertClinicalPatientAccess(req.user!.userId, req.user!.role, record.patientId, practiceId);

    if (req.user!.role === UserRole.PATIENT) {
      // Draft parent visits stay private; draft check-ups (child records) are visible once booked.
      if (record.isDraft && !record.parentRecordId) {
        throw new AppError(404, 'Medical record not found');
      }
      return res.json(toPatientRecordResponse(record));
    }
    res.json(toDoctorRecordResponse(record));
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const body = req.body as Record<string, unknown>;
    const doctorId = await requireDoctorId(req.user!.userId, practiceId);
    const patientId = String(body.patient_id);

    await assertClinicalPatientAccess(req.user!.userId, req.user!.role, patientId, practiceId);

    const notesValue =
      body.doctor_notes_private !== undefined
        ? normalizeDoctorNotesPrivate(body.doctor_notes_private)
        : Prisma.DbNull;

    const record = await prisma.$transaction(async (tx) => {
      const created = await tx.medicalRecord.create({
        data: {
          practiceId,
          patientId,
          doctorId,
          appointmentId: (body.appointment_id as string) ?? null,
          recordDate: body.record_date ? new Date(String(body.record_date)) : new Date(),
          subjective: (body.subjective as string) ?? null,
          objective: (body.objective as string) ?? null,
          assessment: (body.assessment as string) ?? null,
          plan: (body.plan as string) ?? null,
          diagnosisCodes: (body.diagnosis_codes as string[]) ?? [],
          chiefComplaint: (body.chief_complaint as string) ?? null,
          historyPresentIllness: (body.history_present_illness as string) ?? null,
          reviewOfSystems: body.review_of_systems ?? {},
          physicalExamination: body.physical_examination ?? {},
          vitalSigns: body.vital_signs ?? {},
          generalAppearance: (body.general_appearance as string) ?? null,
          primaryDiagnosis: (body.primary_diagnosis as string) ?? null,
          differentialDiagnoses: (body.differential_diagnoses as string[]) ?? [],
          severity: (body.severity as string) ?? null,
          lifestyleAdvice: (body.lifestyle_advice as string) ?? null,
          followUpDate: body.follow_up_date ? new Date(String(body.follow_up_date)) : null,
          isDraft: body.is_draft !== undefined ? Boolean(body.is_draft) : true,
          doctorNotesPrivate: notesValue,
          aiFieldProvenance: body.ai_field_provenance
            ? (body.ai_field_provenance as Prisma.InputJsonValue)
            : undefined,
        },
      });

      const prescriptions = (body.prescriptions as Record<string, unknown>[]) ?? [];
      for (const rx of prescriptions) {
        await tx.prescription.create({
          data: {
            medicalRecordId: created.id,
            patientId: created.patientId,
            doctorId: req.user!.userId,
            drugName: String(rx.drug_name),
            dosage: String(rx.dosage),
            frequency: String(rx.frequency),
            duration: (rx.duration as string) ?? null,
            instructions: (rx.instructions as string) ?? null,
            genericName: (rx.generic_name as string) ?? null,
            brandName: (rx.brand_name as string) ?? null,
            strength: (rx.strength as string) ?? null,
            dosageForm: (rx.dosage_form as string) ?? null,
            route: (rx.route as string) ?? null,
            quantity: rx.quantity ? Number(rx.quantity) : null,
            isPrn: Boolean(rx.is_prn),
            status: (rx.status as string) ?? 'active',
          },
        });
      }

      const referrals = (body.referrals as Record<string, unknown>[]) ?? [];
      for (const ref of referrals) {
        await tx.referral.create({
          data: {
            medicalRecordId: created.id,
            patientId: created.patientId,
            doctorId: req.user!.userId,
            referredTo: String(ref.referred_to),
            specialty: (ref.specialty as string) ?? null,
            reason: String(ref.reason),
            urgency: (ref.urgency as never) ?? 'ROUTINE',
            referredToInstitution: (ref.referred_to_institution as string) ?? null,
            referredToContact: (ref.referred_to_contact as string) ?? null,
            clinicalSummary: (ref.clinical_summary as string) ?? null,
            specificQuestions: (ref.specific_questions as string) ?? null,
            status: (ref.status as string) ?? 'pending',
          },
        });
      }

      return tx.medicalRecord.findFirst({
        where: { id: created.id, practiceId },
        include: medicalRecordInclude,
      });
    });

    await logAudit({
      practiceId,
      actorId: req.user!.userId,
      action: 'CREATE',
      resource: 'medical_records',
      resourceId: record!.id,
      patientId: record!.patientId,
      newValue: { is_draft: record!.isDraft },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json(toDoctorRecordResponse(record!));
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    if (req.user!.role !== UserRole.DOCTOR) {
      throw new AppError(403, 'Insufficient permissions');
    }

    const { practiceId } = tenantWhere(req);
    const body = req.body as Record<string, unknown>;
    const existing = await prisma.medicalRecord.findFirst({
      where: { id: req.params.id, practiceId },
    });
    if (!existing || existing.softDeletedAt) throw new AppError(404, 'Medical record not found');

    const doctorId = await requireDoctorId(req.user!.userId, practiceId);
    if (existing.doctorId !== doctorId) {
      throw new AppError(403, 'You can only edit your own records');
    }

    // Finalized records are immutable except mark-erroneous; use amendments for corrections.
    const markingErroneous =
      body.is_erroneous !== undefined && Boolean(body.is_erroneous) !== existing.isErroneous;
    if (!existing.isDraft && !existing.isErroneous) {
      const clinicalKeys = [
        'assessment',
        'plan',
        'subjective',
        'objective',
        'chief_complaint',
        'history_present_illness',
        'review_of_systems',
        'physical_examination',
        'vital_signs',
        'general_appearance',
        'primary_diagnosis',
        'differential_diagnoses',
        'diagnosis_codes',
        'severity',
        'lifestyle_advice',
        'follow_up_date',
        'doctor_notes_private',
        'prescriptions',
        'referrals',
        'is_draft',
        'ai_field_provenance',
      ];
      const attemptingClinicalEdit = clinicalKeys.some((k) => body[k] !== undefined);
      if (attemptingClinicalEdit && !markingErroneous) {
        throw new AppError(
          409,
          'Finalized medical records cannot be edited. Use an amendment instead.'
        );
      }
      if (markingErroneous) {
        const updated = await prisma.medicalRecord.update({
          where: { id: existing.id },
          data: { isErroneous: Boolean(body.is_erroneous) },
          include: medicalRecordInclude,
        });
        await logAudit({
          practiceId,
          actorId: req.user!.userId,
          action: 'FLAG',
          resource: 'medical_records',
          resourceId: updated.id,
          patientId: updated.patientId,
          oldValue: { is_erroneous: existing.isErroneous },
          newValue: { is_erroneous: updated.isErroneous },
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        });
        return res.json(toDoctorRecordResponse(updated));
      }
    }

    const isAutosave = Boolean(body.autosave);
    if (isAutosave) {
      if (body.is_draft === false) {
        throw new AppError(400, 'Autosave cannot finalize medical records');
      }
      const expectedUpdatedAt = body.expected_updated_at
        ? new Date(String(body.expected_updated_at))
        : null;
      if (expectedUpdatedAt && !Number.isNaN(expectedUpdatedAt.getTime())) {
        if (existing.updatedAt.getTime() > expectedUpdatedAt.getTime()) {
          const current = await prisma.medicalRecord.findFirst({
            where: { id: existing.id, practiceId },
            include: medicalRecordInclude,
          });
          res.status(409).json({
            error: 'A newer version of this draft exists on the server',
            record: toDoctorRecordResponse(current!),
          });
          return;
        }
      }
    }

    const data: Prisma.MedicalRecordUpdateInput = {
      isErroneous: body.is_erroneous !== undefined ? Boolean(body.is_erroneous) : undefined,
      isDraft: isAutosave
        ? true
        : body.is_draft !== undefined
          ? Boolean(body.is_draft)
          : undefined,
      assessment: (body.assessment as string) ?? undefined,
      plan: (body.plan as string) ?? undefined,
      subjective: (body.subjective as string) ?? undefined,
      objective: (body.objective as string) ?? undefined,
      chiefComplaint: (body.chief_complaint as string) ?? undefined,
      historyPresentIllness: (body.history_present_illness as string) ?? undefined,
      reviewOfSystems: body.review_of_systems ?? undefined,
      physicalExamination: body.physical_examination ?? undefined,
      vitalSigns: body.vital_signs ?? undefined,
      generalAppearance: (body.general_appearance as string) ?? undefined,
      primaryDiagnosis: (body.primary_diagnosis as string) ?? undefined,
      differentialDiagnoses: (body.differential_diagnoses as string[]) ?? undefined,
      diagnosisCodes: (body.diagnosis_codes as string[]) ?? undefined,
      severity: (body.severity as string) ?? undefined,
      lifestyleAdvice: (body.lifestyle_advice as string) ?? undefined,
      followUpDate: body.follow_up_date ? new Date(String(body.follow_up_date)) : undefined,
      aiFieldProvenance:
        body.ai_field_provenance !== undefined
          ? (body.ai_field_provenance as Prisma.InputJsonValue)
          : undefined,
    };

    if (body.doctor_notes_private !== undefined) {
      data.doctorNotesPrivate = normalizeDoctorNotesPrivate(body.doctor_notes_private);
    }

    const record = await prisma.$transaction(async (tx) => {
      const updated = await tx.medicalRecord.update({
        where: { id: req.params.id },
        data,
      });

      if (Array.isArray(body.prescriptions)) {
        await tx.prescription.deleteMany({ where: { medicalRecordId: updated.id } });
        for (const rx of body.prescriptions as Record<string, unknown>[]) {
          await tx.prescription.create({
            data: {
              medicalRecordId: updated.id,
              patientId: updated.patientId,
              doctorId: req.user!.userId,
              drugName: String(rx.drug_name),
              dosage: String(rx.dosage ?? rx.strength ?? ''),
              frequency: String(rx.frequency ?? ''),
              duration: (rx.duration as string) ?? null,
              instructions: (rx.instructions as string) ?? null,
              genericName: (rx.generic_name as string) ?? null,
              brandName: (rx.brand_name as string) ?? null,
              strength: (rx.strength as string) ?? null,
              dosageForm: (rx.dosage_form as string) ?? null,
              route: (rx.route as string) ?? null,
              quantity: rx.quantity ? Number(rx.quantity) : null,
              isPrn: Boolean(rx.is_prn),
              status: (rx.status as string) ?? 'active',
            },
          });
        }
      }

      if (Array.isArray(body.referrals)) {
        await tx.referral.deleteMany({ where: { medicalRecordId: updated.id } });
        for (const ref of body.referrals as Record<string, unknown>[]) {
          await tx.referral.create({
            data: {
              medicalRecordId: updated.id,
              patientId: updated.patientId,
              doctorId: req.user!.userId,
              referredTo: String(ref.referred_to),
              specialty: (ref.specialty as string) ?? null,
              reason: String(ref.reason ?? 'Referral'),
              urgency: (ref.urgency as never) ?? 'ROUTINE',
              referredToInstitution: (ref.referred_to_institution as string) ?? null,
              referredToContact: (ref.referred_to_contact as string) ?? null,
              clinicalSummary: (ref.clinical_summary as string) ?? null,
              specificQuestions: (ref.specific_questions as string) ?? null,
              status: (ref.status as string) ?? 'pending',
            },
          });
        }
      }

      return tx.medicalRecord.findFirst({
        where: { id: updated.id, practiceId },
        include: medicalRecordInclude,
      });
    });

    await logAudit({
      practiceId,
      actorId: req.user!.userId,
      action: body.is_erroneous ? 'FLAG' : 'UPDATE',
      resource: 'medical_records',
      resourceId: record!.id,
      patientId: record!.patientId,
      oldValue: {
        is_erroneous: existing.isErroneous,
        is_draft: existing.isDraft,
      },
      newValue: redactAuditPayload(body as Record<string, unknown>),
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json(toDoctorRecordResponse(record!));
  }),

  uploadConsultationRecording: asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const doctorId = await requireDoctorId(req.user!.userId, practiceId);
    const existing = await prisma.medicalRecord.findFirst({
      where: { id: req.params.id, practiceId, softDeletedAt: null },
    });
    if (!existing) throw new AppError(404, 'Medical record not found');
    if (existing.doctorId !== doctorId) {
      throw new AppError(403, 'You can only attach recordings to your own records');
    }
    if (!existing.isDraft) {
      throw new AppError(409, 'Cannot attach AI recordings to a finalized medical record');
    }

    const consentId = String(req.body.consentId || req.body.consent_id || '').trim();
    if (!consentId) {
      throw new AppError(403, 'Recording consent is required to save consultation audio');
    }
    const { requireValidRecordingConsent } = await import('../services/recordingConsentService');
    await requireValidRecordingConsent({
      consentId,
      practiceId,
      doctorId,
      patientId: existing.patientId,
    });

    const file = req.file;
    if (!file) throw new AppError(400, 'audio file is required');
    if (file.size > 25 * 1024 * 1024) {
      throw new AppError(413, 'Audio file exceeds 25MB limit');
    }

    const mimeType = file.mimetype || 'audio/webm';
    const transcript = String(req.body.transcript || '').trim();
    if (!transcript) throw new AppError(400, 'transcript is required');

    let warnings: Prisma.InputJsonValue = [];
    let confidence: Prisma.InputJsonValue = {};
    try {
      if (req.body.warnings) {
        warnings = JSON.parse(String(req.body.warnings)) as Prisma.InputJsonValue;
      }
    } catch {
      warnings = [];
    }
    try {
      if (req.body.confidence) {
        confidence = JSON.parse(String(req.body.confidence)) as Prisma.InputJsonValue;
      }
    } catch {
      confidence = {};
    }

    await deleteConsultationAudioIfExists(existing.scribeAudioPath);
    const relativePath = await writeConsultationAudio({
      practiceId,
      recordId: existing.id,
      buffer: file.buffer,
      mimeType,
    });

    const updated = await prisma.medicalRecord.update({
      where: { id: existing.id },
      data: {
        scribeAudioPath: relativePath,
        scribeAudioMimeType: mimeType,
        scribeTranscript: transcript,
        scribeDetectedLanguage: req.body.detectedLanguage
          ? String(req.body.detectedLanguage)
          : null,
        scribeWarnings: warnings,
        scribeConfidence: confidence,
        scribeRecordedAt: new Date(),
        scribeStatus: 'READY',
      },
      include: medicalRecordInclude,
    });

    await logAudit({
      practiceId,
      actorId: req.user!.userId,
      action: 'AI_SCRIBE_RECORDING_SAVED',
      resource: 'ai_scribe',
      resourceId: updated.id,
      patientId: updated.patientId,
      newValue: {
        mimeType,
        audioBytes: file.size,
        transcriptChars: transcript.length,
        detectedLanguage: updated.scribeDetectedLanguage,
        scribeStatus: 'READY',
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Ephemeral: drop multer buffer reference after persist
    (file as { buffer?: Buffer }).buffer = Buffer.alloc(0);

    res.json(toDoctorRecordResponse(updated));
  }),

  streamConsultationAudio: asyncHandler(async (req: Request, res: Response) => {
    if (req.user!.role !== UserRole.DOCTOR) {
      throw new AppError(403, 'Consultation recordings are only available to doctors');
    }

    const { practiceId } = tenantWhere(req);
    const record = await prisma.medicalRecord.findFirst({
      where: { id: req.params.id, practiceId, softDeletedAt: null },
    });
    if (!record) throw new AppError(404, 'Medical record not found');
    await assertClinicalPatientAccess(req.user!.userId, req.user!.role, record.patientId, practiceId);

    const doctorId = await requireDoctorId(req.user!.userId, practiceId);
    if (record.doctorId !== doctorId) {
      throw new AppError(403, 'You can only access recordings for your own records');
    }

    if (!record.scribeAudioPath) {
      throw new AppError(404, 'No consultation recording for this record');
    }

    if (!(await consultationAudioExists(record.scribeAudioPath))) {
      throw new AppError(404, 'Consultation recording file missing');
    }

    const mime = record.scribeAudioMimeType || 'audio/webm';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, no-store');
    const stream = await openConsultationAudioStream(record.scribeAudioPath);
    stream.pipe(res);
  }),

  addAmendment: asyncHandler(async (req: Request, res: Response) => {
    if (req.user!.role !== UserRole.DOCTOR) {
      throw new AppError(403, 'Insufficient permissions');
    }

    const { practiceId } = tenantWhere(req);
    const existing = await prisma.medicalRecord.findFirst({
      where: { id: req.params.id, practiceId },
    });
    if (!existing || existing.softDeletedAt) throw new AppError(404, 'Medical record not found');

    const doctorId = await requireDoctorId(req.user!.userId, practiceId);
    if (existing.doctorId !== doctorId) {
      throw new AppError(403, 'You can only amend your own records');
    }

    const body = req.body as Record<string, unknown>;
    const amendment = await prisma.medicalRecordAmendment.create({
      data: {
        medicalRecordId: req.params.id,
        doctorId: req.user!.userId,
        correctionNote: String(body.correction_note),
      },
    });

    await logAudit({
      practiceId,
      actorId: req.user!.userId,
      action: 'AMEND',
      resource: 'medical_records',
      resourceId: req.params.id,
      patientId: existing.patientId,
      newValue: { has_correction_note: Boolean(body.correction_note) },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json(toSnakeCase(amendment));
  }),

  count: asyncHandler(async (req: Request, res: Response) => {
    const where = await buildMedicalRecordWhere(req);
    const count = await prisma.medicalRecord.count({ where });
    res.json({ count });
  }),
};
