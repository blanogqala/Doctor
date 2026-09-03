import fs from 'fs';
import path from 'path';
import { createReadStream } from 'fs';
import { env } from '../config/env';
import { generateSecureToken } from '../utils/secureToken';

export type PracticeLogoStorageDriverName = 'local' | 'render-disk';

export interface PracticeLogoStorage {
  readonly driver: PracticeLogoStorageDriverName;
  readonly root: string;
  put(key: string, data: Buffer): Promise<void>;
  openReadStream(key: string): Promise<NodeJS.ReadableStream>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  assertWritable(): Promise<void>;
}

const LEGACY_LOGO_DIR = path.join(process.cwd(), 'uploads', 'logos');

const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export function extensionForLogoMime(mime: string): string {
  return MIME_TO_EXT[mime] || 'png';
}

export function mimeForLogoFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase().replace(/^\./, '');
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

/** Reject path traversal and absolute keys. */
export function assertSafeLogoKey(key: string): string {
  const normalized = key.replace(/\\/g, '/');
  if (
    !normalized ||
    normalized.includes('..') ||
    normalized.startsWith('/') ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    throw new Error('Invalid practice logo storage key');
  }
  return normalized;
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

export function toAbsolutePublicAssetUrl(pathOrUrl: string, publicApiOrigin: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const origin = publicApiOrigin.replace(/\/$/, '');
  const pathname = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  if (!origin) return pathname;
  return `${origin}${pathname}`;
}

export function resolvePublicApiOrigin(options?: {
  configured?: string | null;
  host?: string | null;
  proto?: string | null;
}): string {
  const configured = (options?.configured ?? env.PUBLIC_API_URL ?? '').trim().replace(/\/$/, '');
  if (configured) return configured;
  const host = (options?.host ?? '').trim();
  if (!host) return '';
  const proto = (options?.proto ?? 'https').split(',')[0].trim() || 'https';
  return `${proto}://${host}`;
}

export function publicApiOriginFromRequest(req: {
  get: (name: string) => string | undefined;
  protocol?: string;
}): string {
  return resolvePublicApiOrigin({
    host: req.get('host'),
    proto: req.get('x-forwarded-proto') || req.protocol,
  });
}

export function resolveClinicalStyleLogoRoot(
  driver: PracticeLogoStorageDriverName,
  configuredRoot?: string | null
): string {
  if (configuredRoot && configuredRoot.trim()) {
    return path.resolve(configuredRoot.trim());
  }
  if (driver === 'render-disk') {
    return path.resolve('/var/data/logos');
  }
  return path.resolve(process.cwd(), 'uploads', 'logos');
}

export class FilesystemPracticeLogoStorage implements PracticeLogoStorage {
  readonly driver: PracticeLogoStorageDriverName;
  readonly root: string;

  constructor(driver: PracticeLogoStorageDriverName, root: string) {
    this.driver = driver;
    this.root = path.resolve(root);
  }

  absolutePath(key: string): string {
    const safe = assertSafeLogoKey(key);
    const resolved = path.resolve(this.root, safe);
    const rootWithSep = this.root.endsWith(path.sep) ? this.root : this.root + path.sep;
    if (resolved !== this.root && !resolved.startsWith(rootWithSep)) {
      throw new Error('Practice logo storage path escape blocked');
    }
    return resolved;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const absolute = this.absolutePath(key);
    await fs.promises.mkdir(path.dirname(absolute), { recursive: true });
    await fs.promises.writeFile(absolute, data);
  }

  async openReadStream(key: string): Promise<NodeJS.ReadableStream> {
    const absolute = this.absolutePath(key);
    if (!fs.existsSync(absolute)) {
      throw new Error('Practice logo not found');
    }
    return createReadStream(absolute);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.promises.access(this.absolutePath(key), fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.promises.unlink(this.absolutePath(key));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') throw err;
    }
  }

  async assertWritable(): Promise<void> {
    await fs.promises.mkdir(this.root, { recursive: true });
    const probe = path.join(this.root, `.write-probe-${Date.now()}`);
    await fs.promises.writeFile(probe, 'ok');
    await fs.promises.unlink(probe);
  }
}

let singleton: PracticeLogoStorage | null = null;

export function createPracticeLogoStorage(options?: {
  driver?: PracticeLogoStorageDriverName;
  root?: string | null;
}): PracticeLogoStorage {
  const driver = options?.driver ?? env.PRACTICE_LOGO_STORAGE_DRIVER;
  const root = resolveClinicalStyleLogoRoot(driver, options?.root ?? env.PRACTICE_LOGO_STORAGE_ROOT);
  return new FilesystemPracticeLogoStorage(driver, root);
}

export function getPracticeLogoStorage(): PracticeLogoStorage {
  if (!singleton) {
    singleton = createPracticeLogoStorage();
  }
  return singleton;
}

export function resetPracticeLogoStorageForTests(storage?: PracticeLogoStorage | null) {
  singleton = storage === undefined ? null : storage;
}

export function legacyLogoFilePath(filename: string): string {
  return path.join(LEGACY_LOGO_DIR, path.basename(filename));
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

export async function persistPracticeLogo(params: {
  practiceId: string;
  buffer: Buffer;
  mime: string;
  previousStored: string | null;
  publicApiOrigin: string;
  storage?: PracticeLogoStorage;
}): Promise<{ storageKey: string; publicUrl: string }> {
  const storage = params.storage ?? getPracticeLogoStorage();
  const ext = extensionForLogoMime(params.mime);
  const storageKey = buildPracticeLogoKey(params.practiceId, ext);
  await storage.put(storageKey, params.buffer);

  const previous = parseStoredPracticeLogo(params.previousStored);
  if (previous?.kind === 'key' && previous.key !== storageKey) {
    if (isLogoKeyOwnedByPractice(previous.key, params.practiceId)) {
      await storage.delete(previous.key);
    }
  } else if (previous?.kind === 'legacy-file') {
    try {
      fs.unlinkSync(legacyLogoFilePath(previous.filename));
    } catch {
      // best-effort cleanup of leftover ephemeral files
    }
  }

  const filename = path.basename(storageKey);
  return {
    storageKey,
    publicUrl: toAbsolutePublicAssetUrl(
      publicPracticeLogoPath(params.practiceId, filename),
      params.publicApiOrigin
    ),
  };
}

export async function validatePracticeLogoStorageAtStartup(): Promise<void> {
  const storage = getPracticeLogoStorage();
  try {
    await storage.assertWritable();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (storage.driver === 'render-disk') {
      throw new Error(
        `Practice logo storage is not writable at ${storage.root} (driver=${storage.driver}). ${message}`
      );
    }
    console.warn(`[practice-logo-storage] Could not verify writable root ${storage.root}; continuing`);
  }
}
