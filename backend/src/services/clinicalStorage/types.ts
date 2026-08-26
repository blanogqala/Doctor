import { generateSecureToken } from '../../utils/secureToken';

export type ClinicalStorageDriverName = 'local' | 'render-disk';

export interface ClinicalStorage {
  readonly driver: ClinicalStorageDriverName;
  readonly root: string;
  put(key: string, data: Buffer): Promise<void>;
  openReadStream(key: string): Promise<NodeJS.ReadableStream>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  /** Absolute path for a key (filesystem adapters only). */
  absolutePath(key: string): string;
}

/** Tenant-qualified, non-enumerable clinical object key. */
export function buildClinicalObjectKey(params: {
  practiceId: string;
  recordId: string;
  extension: string;
}): string {
  const ext = params.extension.replace(/^\./, '').toLowerCase() || 'webm';
  const fileId = generateSecureToken().slice(0, 32);
  return `practice/${params.practiceId}/records/${params.recordId}/${fileId}.${ext}`;
}

/** Reject path traversal and absolute keys. */
export function assertSafeStorageKey(key: string): string {
  const normalized = key.replace(/\\/g, '/');
  if (
    !normalized ||
    normalized.includes('..') ||
    normalized.startsWith('/') ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    throw new Error('Invalid clinical storage key');
  }
  return normalized;
}

export function isLegacyConsultationKey(key: string): boolean {
  const k = key.replace(/\\/g, '/');
  return k.startsWith('consultations/');
}
