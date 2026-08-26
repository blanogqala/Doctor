import fs from 'fs';
import path from 'path';
import {
  buildClinicalObjectKey,
  getClinicalStorage,
  isLegacyConsultationKey,
} from './clinicalStorage';
import { FilesystemClinicalStorage } from './clinicalStorage/filesystemStorage';

/** Legacy pre–Block 4 root (uploads/consultations/…). Read-only compatibility. */
const LEGACY_UPLOADS_ROOT = path.join(process.cwd(), 'uploads');

export function extensionForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('wav')) return 'wav';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('mp4') || m.includes('m4a')) return 'm4a';
  return 'webm';
}

function legacyAbsolutePath(relativePath: string): string {
  const safe = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!safe || safe.includes('..')) {
    throw new Error('Invalid legacy upload path');
  }
  const resolved = path.resolve(LEGACY_UPLOADS_ROOT, safe);
  const root = path.resolve(LEGACY_UPLOADS_ROOT);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    throw new Error('Invalid upload path');
  }
  return resolved;
}

/**
 * Persist consultation audio under private clinical storage.
 * Returns the storage key to store in MedicalRecord.scribeAudioPath.
 * Does not delete existing files automatically during key-format migration.
 */
export async function writeConsultationAudio(params: {
  practiceId: string;
  recordId: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<string> {
  const key = buildClinicalObjectKey({
    practiceId: params.practiceId,
    recordId: params.recordId,
    extension: extensionForMime(params.mimeType),
  });
  await getClinicalStorage().put(key, params.buffer);
  return key;
}

export async function consultationAudioExists(storageKey: string | null | undefined): Promise<boolean> {
  if (!storageKey) return false;
  if (isLegacyConsultationKey(storageKey)) {
    return fs.existsSync(legacyAbsolutePath(storageKey));
  }
  return getClinicalStorage().exists(storageKey);
}

export async function openConsultationAudioStream(
  storageKey: string
): Promise<NodeJS.ReadableStream> {
  if (isLegacyConsultationKey(storageKey)) {
    const absolute = legacyAbsolutePath(storageKey);
    if (!fs.existsSync(absolute)) {
      throw new Error('Consultation recording file missing');
    }
    return fs.createReadStream(absolute);
  }
  return getClinicalStorage().openReadStream(storageKey);
}

export async function deleteConsultationAudioIfExists(storageKey: string | null | undefined) {
  if (!storageKey) return;
  try {
    if (isLegacyConsultationKey(storageKey)) {
      const absolute = legacyAbsolutePath(storageKey);
      if (fs.existsSync(absolute)) fs.unlinkSync(absolute);
      return;
    }
    await getClinicalStorage().delete(storageKey);
  } catch {
    // best-effort
  }
}

/** @deprecated Prefer openConsultationAudioStream — kept for rare sync probes. */
export function absoluteUploadPath(relativePath: string): string {
  if (isLegacyConsultationKey(relativePath)) {
    return legacyAbsolutePath(relativePath);
  }
  const storage = getClinicalStorage();
  if (storage instanceof FilesystemClinicalStorage) {
    return storage.absolutePath(relativePath);
  }
  throw new Error('Absolute path unavailable for this clinical storage driver');
}

// Re-export for callers that previously imported ensureConsultationsDir
export function ensureConsultationsDir() {
  const storage = getClinicalStorage();
  if (storage instanceof FilesystemClinicalStorage) {
    fs.mkdirSync(storage.root, { recursive: true });
    return storage.root;
  }
  return storage.root;
}
