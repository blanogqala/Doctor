import { Request, Response } from 'express';
import { RecordingConsentMode } from '@prisma/client';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { logAudit } from '../services/auditService';
import { runConsultationScribe } from '../services/groqScribeService';
import {
  draftReferralLetter,
  enhanceReferralLetter,
} from '../services/referralLetterService';
import { draftClinicalLetter } from '../services/clinicalLetterService';
import { assertPatientAccess } from '../services/accessService';
import { getDoctorIdForProfile } from '../services/accessService';
import { tenantWhere } from '../middleware/tenant';
import { detectAudioMimeFromBuffer } from '../utils/fileSignature';
import { requireValidRecordingConsent } from '../services/recordingConsentService';
import { referralUrgencySchema } from '../validation/schemas';

const ALLOWED_MIME = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'video/webm',
]);

/** In-flight duplicate-processing guard (single-process; not durable idempotency). */
const inFlightScribe = new Map<string, number>();
const IN_FLIGHT_TTL_MS = 120_000;

function avgConfidence(scores: Record<string, number>): number | null {
  const values = Object.values(scores);
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function beginScribeJob(key: string) {
  const now = Date.now();
  for (const [k, started] of inFlightScribe) {
    if (now - started > IN_FLIGHT_TTL_MS) inFlightScribe.delete(k);
  }
  if (inFlightScribe.has(key)) {
    throw new AppError(409, 'AI Clinical Assistant is already processing for this patient. Please wait.');
  }
  inFlightScribe.set(key, now);
}

function endScribeJob(key: string) {
  inFlightScribe.delete(key);
}

export const aiController = {
  consultationScribe: asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const patientId = String(req.body.patientId || '').trim();
    const consentId = String(req.body.consentId || '').trim();
    const medicalRecordId = String(req.body.medicalRecordId || '').trim() || null;
    const consentModeRaw = String(req.body.consentMode || 'CONSULTATION').trim().toUpperCase();
    const expectedMode =
      consentModeRaw === 'DICTATION'
        ? RecordingConsentMode.DICTATION
        : RecordingConsentMode.CONSULTATION;
    if (!patientId) {
      throw new AppError(400, 'patientId is required');
    }
    if (!consentId) {
      throw new AppError(403, 'Recording consent is required before AI transcription');
    }
    if (expectedMode === RecordingConsentMode.DICTATION && !medicalRecordId) {
      throw new AppError(400, 'medicalRecordId is required for dictation scribe');
    }

    await assertPatientAccess(req.user!.userId, req.user!.role, patientId, practiceId);
    const doctorId = await getDoctorIdForProfile(req.user!.userId, practiceId);
    if (!doctorId) throw new AppError(403, 'Doctor profile required');

    await requireValidRecordingConsent({
      consentId,
      practiceId,
      doctorId,
      patientId,
      expectedMode,
      expectedMedicalRecordId:
        expectedMode === RecordingConsentMode.DICTATION ? medicalRecordId : medicalRecordId,
    });

    const file = req.file;
    if (!file) {
      throw new AppError(400, 'audio file is required');
    }

    if (file.size > 25 * 1024 * 1024) {
      throw new AppError(413, 'Audio file exceeds 25MB limit');
    }

    const detected = detectAudioMimeFromBuffer(file.buffer);
    const declared = (file.mimetype || '').toLowerCase();
    if (!detected) {
      throw new AppError(400, 'Unrecognized audio format');
    }
    if (
      declared &&
      !ALLOWED_MIME.has(declared) &&
      !declared.startsWith('audio/') &&
      declared !== 'application/octet-stream'
    ) {
      throw new AppError(400, `Unsupported audio type: ${file.mimetype}`);
    }

    const mimeType = detected;
    const jobKey = `${doctorId}:${patientId}`;
    beginScribeJob(jobKey);

    const audioBuffer = file.buffer;

    try {
      await logAudit({
        practiceId,
        actorId: req.user!.userId,
        action: 'SCRIBE_RECORDING_COMPLETED',
        resource: 'ai_scribe',
        patientId,
        newValue: { consentId, audioBytes: file.size, mimeType },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      const result = await runConsultationScribe({
        audio: audioBuffer,
        filename: file.originalname || 'consultation.webm',
        mimeType,
      });

      await logAudit({
        practiceId,
        actorId: req.user!.userId,
        action: 'AI_TRANSCRIPTION_COMPLETED',
        resource: 'ai_scribe',
        patientId,
        newValue: {
          detectedLanguage: result.detectedLanguage,
          transcriptChars: result.transcript.length,
          modelAsr: result.models.asr,
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      await logAudit({
        practiceId,
        actorId: req.user!.userId,
        action: 'AI_NOTE_GENERATED',
        resource: 'ai_scribe',
        patientId,
        newValue: {
          confidenceAvg: avgConfidence(result.confidenceScores),
          processingTimeMs: result.processingTimeMs,
          modelLlm: result.models.llm,
          warningCount: result.warnings.length,
          suggestionFieldCount: Object.keys(result.suggestions).length,
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.json({
        success: true,
        transcript: result.transcript,
        detectedLanguage: result.detectedLanguage,
        suggestions: result.suggestions,
        confidenceScores: result.confidenceScores,
        warnings: result.warnings,
        models: result.models,
      });
    } finally {
      endScribeJob(jobKey);
      (file as { buffer?: Buffer }).buffer = Buffer.alloc(0);
    }
  }),

  referralEnhance: asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const patientId = String(req.body?.patientId || req.body?.patient_id || '').trim();
    if (!patientId) {
      throw new AppError(400, 'patientId is required');
    }
    await assertPatientAccess(req.user!.userId, req.user!.role, patientId, practiceId);

    const letter = typeof req.body?.letter === 'string' ? req.body.letter : '';
    if (!letter.trim()) {
      throw new AppError(400, 'letter is required');
    }
    if (letter.length > 20000) {
      throw new AppError(400, 'letter exceeds maximum length');
    }

    const enhanced = await enhanceReferralLetter(letter);

    await logAudit({
      practiceId,
      actorId: req.user!.userId,
      action: 'AI_DOCUMENT_GENERATED',
      resource: 'ai_referral',
      patientId,
      newValue: {
        documentType: 'REFERRAL_ENHANCE',
        inputChars: letter.trim().length,
        outputChars: enhanced.length,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ letter: enhanced, status: 'draft' });
  }),

  referralDraft: asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const patientId = String(req.body?.patientId || req.body?.patient_id || '').trim();
    if (!patientId) {
      throw new AppError(400, 'patientId is required');
    }
    await assertPatientAccess(req.user!.userId, req.user!.role, patientId, practiceId);

    const patientDisplayName = String(req.body?.patientDisplayName || '').trim();
    if (!patientDisplayName) {
      throw new AppError(400, 'patientDisplayName is required');
    }

    const urgencyRaw = req.body?.referral?.urgency;
    if (urgencyRaw !== undefined && urgencyRaw !== null && urgencyRaw !== '') {
      const parsed = referralUrgencySchema.safeParse(urgencyRaw);
      if (!parsed.success) {
        throw new AppError(400, 'referral.urgency must be ROUTINE or URGENT');
      }
    }

    const letter = await draftReferralLetter({
      patientDisplayName,
      letterDate: req.body?.letterDate ?? null,
      ageOrDobHint: req.body?.ageOrDobHint ?? null,
      gender: req.body?.gender ?? null,
      referringDoctor: req.body?.referringDoctor || null,
      patient: req.body?.patient || null,
      clinical: req.body?.clinical || {},
      referral: req.body?.referral || {},
    });

    await logAudit({
      practiceId,
      actorId: req.user!.userId,
      action: 'AI_DOCUMENT_GENERATED',
      resource: 'ai_referral',
      patientId,
      newValue: {
        documentType: 'REFERRAL_DRAFT',
        hasClinical: Boolean(req.body?.clinical),
        hasReferralMeta: Boolean(req.body?.referral),
        outputChars: letter.length,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ letter, status: 'draft' });
  }),

  clinicalLetterDraft: asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const patientId = String(req.body?.patient_id || '').trim();
    if (!patientId) throw new AppError(400, 'patient_id is required');
    await assertPatientAccess(req.user!.userId, req.user!.role, patientId, practiceId);

    const documentType = String(req.body?.document_type || '');
    if (
      documentType !== 'MEDICAL_CERTIFICATE' &&
      documentType !== 'WORK_ATTENDANCE' &&
      documentType !== 'SCHOOL_ATTENDANCE'
    ) {
      throw new AppError(400, 'Invalid document_type');
    }

    const patientDisplayName = String(req.body?.patient_display_name || '').trim();
    if (!patientDisplayName) {
      throw new AppError(400, 'patient_display_name is required');
    }

    if (documentType === 'MEDICAL_CERTIFICATE') {
      if (!req.body?.absence_start || !req.body?.absence_end) {
        throw new AppError(
          400,
          'Medical certificate drafts require doctor-provided absence_start and absence_end'
        );
      }
    }

    const letter = await draftClinicalLetter({
      documentType: documentType as
        | 'MEDICAL_CERTIFICATE'
        | 'WORK_ATTENDANCE'
        | 'SCHOOL_ATTENDANCE',
      patientDisplayName,
      doctorDisplayName: req.body?.doctor_display_name ?? null,
      practiceName: req.body?.practice_name ?? null,
      letterDate: req.body?.letter_date ?? null,
      absenceStart: req.body?.absence_start ?? null,
      absenceEnd: req.body?.absence_end ?? null,
      restrictions: req.body?.restrictions ?? null,
      includeDiagnosis: Boolean(req.body?.include_diagnosis),
      diagnosisText: req.body?.diagnosis_text ?? null,
      doctorNotes: req.body?.doctor_notes ?? null,
    });

    await logAudit({
      practiceId,
      actorId: req.user!.userId,
      action: 'AI_DOCUMENT_GENERATED',
      resource: 'ai_clinical_letter',
      patientId,
      newValue: {
        documentType,
        outputChars: letter.length,
        includeDiagnosis: Boolean(req.body?.include_diagnosis),
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ letter, status: 'draft', document_type: documentType });
  }),

  /** Server-side accept/reject audit (no clinical body). */
  suggestionDecision: asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const patientId = String(req.body?.patient_id || '').trim();
    const medicalRecordId = req.body?.medical_record_id
      ? String(req.body.medical_record_id)
      : null;
    const decision = String(req.body?.decision || '').toUpperCase();
    const fields = Array.isArray(req.body?.fields)
      ? (req.body.fields as unknown[]).map(String).slice(0, 50)
      : [];

    if (!patientId) throw new AppError(400, 'patient_id is required');
    if (decision !== 'ACCEPTED' && decision !== 'REJECTED') {
      throw new AppError(400, 'decision must be ACCEPTED or REJECTED');
    }

    await assertPatientAccess(req.user!.userId, req.user!.role, patientId, practiceId);

    await logAudit({
      practiceId,
      actorId: req.user!.userId,
      action: decision === 'ACCEPTED' ? 'AI_SUGGESTION_ACCEPTED' : 'AI_SUGGESTION_REJECTED',
      resource: 'ai_scribe',
      resourceId: medicalRecordId ?? undefined,
      patientId,
      newValue: { fieldCount: fields.length, fields },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ ok: true });
  }),
};
