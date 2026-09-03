import fs from 'fs';
import path from 'path';
import { writeStructuredLog } from '../middleware/requestLogger';
import { generateSecureToken } from '../utils/secureToken';
import {
  FilesystemPracticeMediaStorage,
  assertSafeMediaKey,
  createPracticeMediaStorage,
  extensionForImageMime,
  getPracticeMediaStorage,
  mimeForMediaFilename,
  publicApiOriginFromRequest,
  resolveLegacyLogoRoot,
  resolvePracticeMediaDriver,
  resolvePublicApiOrigin,
  resetPracticeMediaStorageForTests,
  toAbsolutePublicAssetUrl,
  type PracticeMediaStorage,
  type PracticeMediaStorageDriverName,
} from './practiceMediaStorage';

export {
  assertSafeMediaKey as assertSafeLogoKey,
  publicApiOriginFromRequest,
  resolvePublicApiOrigin,
  toAbsolutePublicAssetUrl,
};

/** Logos share the generalized public media storage; these aliases keep call sites stable. */
export type PracticeLogoStorageDriverName = PracticeMediaStorageDriverName;
export type PracticeLogoStorage = PracticeMediaStorage;
export const FilesystemPracticeLogoStorage = FilesystemPracticeMediaStorage;

export function extensionForLogoMime(mime: string): string {
  return extensionForImageMime(mime);
}

export function mimeForLogoFilename(filename: string): string {
  return mimeForMediaFilename(filename);
}

export function buildPracticeLogoKey(practiceId: string, extension: string): string {
  const ext = extension.replace(/^\./, '').toLowerCase() || 'png';
  const fileId = generateSecureToken().slice(0, 24);
  return `practice/${practiceId}/logos/${fileId}.${ext}`;
}

export function isLogoKeyOwnedByPractice(key: string, practiceId: string): boolean {
  const normalized = key.replace(/\\/g, '/');
  return normalized.startsWith(`practice/${practiceId}/logos/`) && !normalized.includes('..');
}

export type StoredPracticeLogoRef =
  | { kind: 'key'; key: string; practiceId: string; filename: string }
  | { kind: 'legacy-file'; filename: string }
  | { kind: 'absolute'; url: string };

export function parseStoredPracticeLogo(stored: string | null | undefined): StoredPracticeLogoRef | null {
  if (!stored || !stored.trim()) return null;
  const value = stored.trim();

  const fromPublicPath = (pathname: string): StoredPracticeLogoRef | null => {
    const publicMatch = pathname.match(/\/api\/public\/practice-logos\/([^/]+)\/([^/?#]+)/);
    if (publicMatch) {
      const practiceId = decodeURIComponent(publicMatch[1]);
      const filename = path.basename(decodeURIComponent(publicMatch[2]));
      const key = `practice/${practiceId}/logos/${filename}`;
      if (!isLogoKeyOwnedByPractice(key, practiceId)) return null;
      return { kind: 'key', key, practiceId, filename };
    }
    const legacyMatch = pathname.match(/\/api\/practice\/logo-file\/([^/?#]+)/);
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
    const normalized = value.replace(/\\/g, '/');
    const parts = normalized.split('/');
    if (parts.length === 4 && parts[0] === 'practice' && parts[2] === 'logos' && parts[1] && parts[3]) {
      const practiceId = parts[1];
      const filename = path.basename(parts[3]);
      const key = `practice/${practiceId}/logos/${filename}`;
      if (!isLogoKeyOwnedByPractice(key, practiceId)) return null;
      return { kind: 'key', key, practiceId, filename };
    }
    return null;
  }

  const fromRelative = fromPublicPath(value.startsWith('/') ? value : `/${value}`);
  if (fromRelative) return fromRelative;

  return null;
}

export function publicPracticeLogoPath(practiceId: string, filename: string): string {
  return `/api/public/practice-logos/${encodeURIComponent(practiceId)}/${encodeURIComponent(filename)}`;
}

export function resolveClinicalStyleLogoRoot(
  driver: PracticeLogoStorageDriverName,
  configuredRoot?: string | null
): string {
  return resolveLegacyLogoRoot(driver, configuredRoot);
}

export function createPracticeLogoStorage(options?: {
  driver?: PracticeLogoStorageDriverName;
  root?: string | null;
}): PracticeLogoStorage {
  return createPracticeMediaStorage({
    driver: options?.driver,
    root: options?.root,
    // An explicitly supplied root is self-contained (tests); no cross-root fallback.
    legacyLogoRoot: options?.root ?? undefined,
  });
}

export function getPracticeLogoStorage(): PracticeLogoStorage {
  return getPracticeMediaStorage();
}

export function resetPracticeLogoStorageForTests(storage?: PracticeLogoStorage | null) {
  resetPracticeMediaStorageForTests(storage);
}

/** Pre-storage-abstraction logo files that were written straight into cwd/uploads/logos. */
export function legacyLogoFilePath(filename: string): string {
  const root = resolveLegacyLogoRoot(resolvePracticeMediaDriver(), null);
  return path.join(root, path.basename(filename));
}

export function legacyLogoFileExists(filename: string): boolean {
  try {
    return fs.existsSync(legacyLogoFilePath(filename));
  } catch {
    return false;
  }
}

export async function resolvePublicPracticeLogoUrl(params: {
  stored: string | null | undefined;
  practiceId: string;
  publicApiOrigin: string;
  storage?: PracticeLogoStorage;
  legacyExists?: (filename: string) => boolean;
}): Promise<string | null> {
  const parsed = parseStoredPracticeLogo(params.stored);
  if (!parsed) return null;

  if (parsed.kind === 'absolute') {
    return parsed.url;
  }

  if (parsed.kind === 'legacy-file') {
    const exists = (params.legacyExists ?? legacyLogoFileExists)(parsed.filename);
    if (!exists) return null;
    return toAbsolutePublicAssetUrl(
      `/api/practice/logo-file/${encodeURIComponent(parsed.filename)}`,
      params.publicApiOrigin
    );
  }

  if (parsed.practiceId !== params.practiceId) {
    return null;
  }

  const storage = params.storage ?? getPracticeLogoStorage();
  if (!(await storage.exists(parsed.key))) {
    return null;
  }

  return toAbsolutePublicAssetUrl(
    publicPracticeLogoPath(parsed.practiceId, parsed.filename),
    params.publicApiOrigin
  );
}

/**
 * Writes a new unique object only. Previous-object cleanup happens after a
 * successful database commit via deletePreviousPracticeLogo().
 */
export async function persistPracticeLogo(params: {
  practiceId: string;
  buffer: Buffer;
  mime: string;
  publicApiOrigin: string;
  storage?: PracticeLogoStorage;
}): Promise<{ storageKey: string; publicUrl: string }> {
  const storage = params.storage ?? getPracticeLogoStorage();
  const ext = extensionForLogoMime(params.mime);
  const storageKey = buildPracticeLogoKey(params.practiceId, ext);
  await storage.put(storageKey, params.buffer);

  const filename = path.basename(storageKey);
  return {
    storageKey,
    publicUrl: toAbsolutePublicAssetUrl(
      publicPracticeLogoPath(params.practiceId, filename),
      params.publicApiOrigin
    ),
  };
}

/** Best-effort delete of a newly-written owned key after a failed DB update. */
export async function deleteOwnedPracticeLogoKey(params: {
  storageKey: string;
  practiceId: string;
  storage?: PracticeLogoStorage;
  reason: 'db_update_failed';
}): Promise<void> {
  if (!isLogoKeyOwnedByPractice(params.storageKey, params.practiceId)) {
    return;
  }
  try {
    await (params.storage ?? getPracticeLogoStorage()).delete(params.storageKey);
  } catch (err) {
    writeStructuredLog('warn', 'practice_logo_compensation_cleanup_failed', {
      practiceId: params.practiceId,
      reason: params.reason,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Deletes the previous owned practice logo after DB commit succeeds.
 * Failures are logged and swallowed — the upload already succeeded.
 */
export async function deletePreviousPracticeLogo(params: {
  previousStored: string | null;
  practiceId: string;
  excludeKey?: string;
  storage?: PracticeLogoStorage;
}): Promise<void> {
  const parsed = parseStoredPracticeLogo(params.previousStored);
  if (!parsed) return;

  if (parsed.kind === 'key') {
    if (parsed.key === params.excludeKey) return;
    if (!isLogoKeyOwnedByPractice(parsed.key, params.practiceId)) return;
    try {
      await (params.storage ?? getPracticeLogoStorage()).delete(parsed.key);
    } catch (err) {
      writeStructuredLog('warn', 'practice_logo_previous_cleanup_failed', {
        practiceId: params.practiceId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (parsed.kind === 'legacy-file') {
    try {
      fs.unlinkSync(legacyLogoFilePath(parsed.filename));
    } catch (err) {
      writeStructuredLog('warn', 'practice_logo_legacy_cleanup_failed', {
        practiceId: params.practiceId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export { validatePracticeMediaStorageAtStartup } from './practiceMediaStorage';
