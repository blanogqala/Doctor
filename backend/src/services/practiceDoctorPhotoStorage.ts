import fs from 'fs';
import path from 'path';
import { generateSecureToken } from '../utils/secureToken';
import {
  extensionForImageMime,
  getPracticeMediaStorage,
  toAbsolutePublicAssetUrl,
  type PracticeMediaStorage,
} from './practiceMediaStorage';

/**
 * Public doctor/practitioner photos. Same durable public media storage as logos,
 * with keys qualified by BOTH practice and doctor so a key can never be replayed
 * against another tenant or another doctor.
 */

export function buildDoctorPhotoKey(
  practiceId: string,
  doctorId: string,
  extension: string
): string {
  const ext = extension.replace(/^\./, '').toLowerCase() || 'png';
  const fileId = generateSecureToken().slice(0, 24);
  return `practice/${practiceId}/doctors/${doctorId}/${fileId}.${ext}`;
}

export function isDoctorPhotoKeyOwned(key: string, practiceId: string, doctorId: string): boolean {
  const normalized = key.replace(/\\/g, '/');
  return (
    normalized.startsWith(`practice/${practiceId}/doctors/${doctorId}/`) &&
    !normalized.includes('..')
  );
}

export type StoredDoctorPhotoRef =
  | { kind: 'key'; key: string; practiceId: string; doctorId: string; filename: string }
  | { kind: 'legacy-file'; filename: string }
  | { kind: 'absolute'; url: string };

function keyRef(
  practiceId: string,
  doctorId: string,
  rawFilename: string
): StoredDoctorPhotoRef | null {
  const filename = path.basename(rawFilename);
  if (!practiceId || !doctorId || !filename) return null;
  const key = `practice/${practiceId}/doctors/${doctorId}/${filename}`;
  if (!isDoctorPhotoKeyOwned(key, practiceId, doctorId)) return null;
  return { kind: 'key', key, practiceId, doctorId, filename };
}

export function parseStoredDoctorPhoto(
  stored: string | null | undefined
): StoredDoctorPhotoRef | null {
  if (!stored || !stored.trim()) return null;
  const value = stored.trim();

  const fromPublicPath = (pathname: string): StoredDoctorPhotoRef | null => {
    const publicMatch = pathname.match(
      /\/api\/public\/practice-doctor-photos\/([^/]+)\/([^/]+)\/([^/?#]+)/
    );
    if (publicMatch) {
      return keyRef(
        decodeURIComponent(publicMatch[1]),
        decodeURIComponent(publicMatch[2]),
        decodeURIComponent(publicMatch[3])
      );
    }
    const legacyMatch = pathname.match(/\/api\/practice\/doctor-photo\/([^/?#]+)/);
    if (legacyMatch) {
      return { kind: 'legacy-file', filename: path.basename(legacyMatch[1]) };
    }
    return null;
  };

  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      const fromPath = fromPublicPath(parsed.pathname);
      if (fromPath) return fromPath;
    } catch {
      return { kind: 'absolute', url: value };
    }
    return { kind: 'absolute', url: value };
  }

  if (value.startsWith('practice/')) {
    const parts = value.replace(/\\/g, '/').split('/');
    if (
      parts.length === 5 &&
      parts[0] === 'practice' &&
      parts[2] === 'doctors' &&
      parts[1] &&
      parts[3] &&
      parts[4]
    ) {
      return keyRef(parts[1], parts[3], parts[4]);
    }
    return null;
  }

  return fromPublicPath(value.startsWith('/') ? value : `/${value}`);
}

export function publicDoctorPhotoPath(
  practiceId: string,
  doctorId: string,
  filename: string
): string {
  return `/api/public/practice-doctor-photos/${encodeURIComponent(practiceId)}/${encodeURIComponent(
    doctorId
  )}/${encodeURIComponent(filename)}`;
}

/** Pre-abstraction photos written straight into cwd/uploads/doctor-photos. */
export function legacyDoctorPhotoDir(): string {
  return path.resolve(process.cwd(), 'uploads', 'doctor-photos');
}

export function legacyDoctorPhotoFilePath(filename: string): string {
  return path.join(legacyDoctorPhotoDir(), path.basename(filename));
}

export function legacyDoctorPhotoExists(filename: string): boolean {
  try {
    return fs.existsSync(legacyDoctorPhotoFilePath(filename));
  } catch {
    return false;
  }
}

/**
 * Absolute public URL for a stored photo, or null when the object no longer exists.
 * Never returns a dead URL — callers render a fallback instead.
 */
export async function resolvePublicDoctorPhotoUrl(params: {
  stored: string | null | undefined;
  practiceId: string;
  doctorId: string;
  publicApiOrigin: string;
  storage?: PracticeMediaStorage;
  legacyExists?: (filename: string) => boolean;
}): Promise<string | null> {
  const parsed = parseStoredDoctorPhoto(params.stored);
  if (!parsed) return null;

  if (parsed.kind === 'absolute') {
    return parsed.url;
  }

  if (parsed.kind === 'legacy-file') {
    const exists = (params.legacyExists ?? legacyDoctorPhotoExists)(parsed.filename);
    if (!exists) return null;
    return toAbsolutePublicAssetUrl(
      `/api/practice/doctor-photo/${encodeURIComponent(parsed.filename)}`,
      params.publicApiOrigin
    );
  }

  if (parsed.practiceId !== params.practiceId || parsed.doctorId !== params.doctorId) {
    return null;
  }

  const storage = params.storage ?? getPracticeMediaStorage();
  if (!(await storage.exists(parsed.key))) {
    return null;
  }

  return toAbsolutePublicAssetUrl(
    publicDoctorPhotoPath(parsed.practiceId, parsed.doctorId, parsed.filename),
    params.publicApiOrigin
  );
}

/**
 * Writes a new unique object, then best-effort removes the previous one.
 * Only objects owned by this practice AND doctor are ever deleted.
 */
export async function persistDoctorPhoto(params: {
  practiceId: string;
  doctorId: string;
  buffer: Buffer;
  mime: string;
  previousStored: string | null;
  publicApiOrigin: string;
  storage?: PracticeMediaStorage;
}): Promise<{ storageKey: string; publicUrl: string }> {
  const storage = params.storage ?? getPracticeMediaStorage();
  const ext = extensionForImageMime(params.mime);
  const storageKey = buildDoctorPhotoKey(params.practiceId, params.doctorId, ext);
  await storage.put(storageKey, params.buffer);

  const previous = parseStoredDoctorPhoto(params.previousStored);
  if (previous?.kind === 'key' && previous.key !== storageKey) {
    if (isDoctorPhotoKeyOwned(previous.key, params.practiceId, params.doctorId)) {
      await storage.delete(previous.key);
    }
  } else if (previous?.kind === 'legacy-file') {
    try {
      fs.unlinkSync(legacyDoctorPhotoFilePath(previous.filename));
    } catch {
      // best-effort cleanup of leftover ephemeral files
    }
  }

  return {
    storageKey,
    publicUrl: toAbsolutePublicAssetUrl(
      publicDoctorPhotoPath(params.practiceId, params.doctorId, path.basename(storageKey)),
      params.publicApiOrigin
    ),
  };
}