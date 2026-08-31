import { medicalRecordsApi } from '@/lib/api/medical-records';
import type { MedicalRecord } from '@/lib/types';

export interface PendingConsultationRecording {
  audioBlob: Blob | null;
  aiTranscript: string | null;
  consentId: string | null;
  detectedLanguage?: string | null;
  aiWarnings?: string[];
  aiConfidence?: Record<string, number>;
}

export function hasPendingConsultationRecording(
  pending: PendingConsultationRecording
): boolean {
  return !!(pending.audioBlob && pending.aiTranscript?.trim() && pending.consentId);
}

export function hasPendingRecordingWithoutConsent(
  pending: PendingConsultationRecording
): boolean {
  return !!(pending.audioBlob && pending.aiTranscript?.trim() && !pending.consentId);
}

export async function persistConsultationRecording(
  recordId: string,
  pending: PendingConsultationRecording
): Promise<MedicalRecord> {
  if (!hasPendingConsultationRecording(pending)) {
    throw new Error('Missing recording, transcript, or consent');
  }

  return medicalRecordsApi.uploadConsultationRecording({
    recordId,
    audio: pending.audioBlob!,
    transcript: pending.aiTranscript!.trim(),
    consentId: pending.consentId!,
    detectedLanguage: pending.detectedLanguage,
    warnings: pending.aiWarnings ?? [],
    confidence: pending.aiConfidence ?? {},
    filename: `consultation-${recordId}.webm`,
  });
}

export type SaveConsultationWithRecordingResult = {
  record: MedicalRecord;
  recordingSaved: boolean;
  uploadFailed: boolean;
};

/**
 * Saves a consultation record and persists AI recording while the record is still a draft.
 * When finalizing with a pending recording: draft → upload → finalize.
 */
export async function saveConsultationWithRecording(params: {
  finalize: boolean;
  pending: PendingConsultationRecording;
  saveRecord: (isDraft: boolean) => Promise<MedicalRecord>;
}): Promise<SaveConsultationWithRecordingResult> {
  const { finalize, pending, saveRecord } = params;
  const hasRecording = hasPendingConsultationRecording(pending);

  if (finalize && hasRecording) {
    const record = await saveRecord(true);
    try {
      const updated = await persistConsultationRecording(record.id, pending);
      const recordingSaved = !!updated.has_scribe_recording;
      const finalized = await saveRecord(false);
      return { record: finalized, recordingSaved, uploadFailed: false };
    } catch {
      return { record, recordingSaved: false, uploadFailed: true };
    }
  }

  const record = await saveRecord(!finalize);
  if (!hasRecording) {
    return { record, recordingSaved: false, uploadFailed: false };
  }

  try {
    const updated = await persistConsultationRecording(record.id, pending);
    return {
      record: updated,
      recordingSaved: !!updated.has_scribe_recording,
      uploadFailed: false,
    };
  } catch {
    return { record, recordingSaved: false, uploadFailed: true };
  }
}
