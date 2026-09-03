import fs from 'fs';
import path from 'path';
import { createReadStream } from 'fs';
import { env } from '../config/env';

/**
 * Durable storage for PUBLIC practice media (logos, doctor photos).
 * Private clinical media has its own separate ClinicalStorage and is not touched here.
 */
export type PracticeMediaStorageDriverName = 'local' | 'render-disk';

export interface PracticeMediaStorage {
  readonly driver: PracticeMediaStorageDriverName;
  readonly root: string;
  /** Read-only roots consulted when a key is absent from `root` (pre-move objects). */
  readonly fallbackRoots: readonly string[];
  put(key: string, data: Buffer): Promise<void>;
  openReadStream(key: string): Promise<NodeJS.ReadableStream>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  assertWritable(): Promise<void>;
}

const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export function extensionForImageMime(mime: string): string {
  return MIME_TO_EXT[mime] || 'png';
}

export function mimeForMediaFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase().replace(/^\./, '');
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

/** Reject path traversal and absolute keys. */
export function assertSafeMediaKey(key: string): string {
  const normalized = key.replace(/\\/g, '/');
  if (
    !normalized ||
    normalized.includes('..') ||
    normalized.startsWith('/') ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    throw new Error('Invalid practice media storage key');
  }
  return normalized;
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

export function resolvePracticeMediaRoot(
  driver: PracticeMediaStorageDriverName,
  configuredRoot?: string | null
): string {
  if (configuredRoot && configuredRoot.trim()) {
    return path.resolve(configuredRoot.trim());
  }
  if (driver === 'render-disk') {
    return path.resolve('/var/data/public-media');
  }
  return path.resolve(process.cwd(), 'uploads', 'public-media');
}

/** Root used before public media was unified; still readable so existing logos keep resolving. */
export function resolveLegacyLogoRoot(
  driver: PracticeMediaStorageDriverName,
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

export class FilesystemPracticeMediaStorage implements PracticeMediaStorage {
  readonly driver: PracticeMediaStorageDriverName;
  readonly root: string;
  readonly fallbackRoots: readonly string[];

  constructor(
    driver: PracticeMediaStorageDriverName,
    root: string,
    fallbackRoots: readonly string[] = []
  ) {
    this.driver = driver;
    this.root = path.resolve(root);
    this.fallbackRoots = fallbackRoots
      .map((candidate) => path.resolve(candidate))
      .filter((candidate) => candidate !== this.root);
  }

  private resolveWithin(root: string, key: string): string {
    const safe = assertSafeMediaKey(key);
    const resolved = path.resolve(root, safe);
    const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
    if (resolved !== root && !resolved.startsWith(rootWithSep)) {
      throw new Error('Practice media storage path escape blocked');
    }
    return resolved;
  }

  absolutePath(key: string): string {
    return this.resolveWithin(this.root, key);
  }

  /** Primary path first, then read-only fallback roots. Always at least one entry. */
  private candidatePaths(key: string): string[] {
    return [
      this.absolutePath(key),
      ...this.fallbackRoots.map((root) => this.resolveWithin(root, key)),
    ];
  }

  private findExistingPath(key: string): string | null {
    for (const candidate of this.candidatePaths(key)) {
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const absolute = this.absolutePath(key);
    await fs.promises.mkdir(path.dirname(absolute), { recursive: true });
    await fs.promises.writeFile(absolute, data);
  }

  async openReadStream(key: string): Promise<NodeJS.ReadableStream> {
    const absolute = this.findExistingPath(key);
    if (!absolute) {
      throw new Error('Practice media object not found');
    }
    return createReadStream(absolute);
  }

  async exists(key: string): Promise<boolean> {
    try {
      return this.findExistingPath(key) !== null;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    for (const candidate of this.candidatePaths(key)) {
      try {
        await fs.promises.unlink(candidate);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT') throw err;
      }
    }
  }

  async assertWritable(): Promise<void> {
    await fs.promises.mkdir(this.root, { recursive: true });
    const probe = path.join(this.root, `.write-probe-${Date.now()}`);
    await fs.promises.writeFile(probe, 'ok');
    await fs.promises.unlink(probe);
  }
}

let singleton: PracticeMediaStorage | null = null;

/** Effective driver: PRACTICE_MEDIA_STORAGE_DRIVER, falling back to the older logo variable. */
export function resolvePracticeMediaDriver(): PracticeMediaStorageDriverName {
  return env.PRACTICE_MEDIA_STORAGE_DRIVER ?? env.PRACTICE_LOGO_STORAGE_DRIVER;
}

export function createPracticeMediaStorage(options?: {
  driver?: PracticeMediaStorageDriverName;
  root?: string | null;
  legacyLogoRoot?: string | null;
}): PracticeMediaStorage {
  const driver = options?.driver ?? resolvePracticeMediaDriver();
  const root = resolvePracticeMediaRoot(driver, options?.root ?? env.PRACTICE_MEDIA_STORAGE_ROOT);
  const legacyLogoRoot = resolveLegacyLogoRoot(
    driver,
    options?.legacyLogoRoot ?? env.PRACTICE_LOGO_STORAGE_ROOT
  );
  return new FilesystemPracticeMediaStorage(driver, root, [legacyLogoRoot]);
}

export function getPracticeMediaStorage(): PracticeMediaStorage {
  if (!singleton) {
    singleton = createPracticeMediaStorage();
  }
  return singleton;
}

export function resetPracticeMediaStorageForTests(storage?: PracticeMediaStorage | null) {
  singleton = storage === undefined ? null : storage;
}

/**
 * Fail closed in deploys backed by a Render Persistent Disk.
 * Writable is not the same as durable — durability comes from the mounted disk itself.
 */
export async function validatePracticeMediaStorageAtStartup(): Promise<void> {
  const storage = getPracticeMediaStorage();
  try {
    await storage.assertWritable();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (storage.driver === 'render-disk') {
      throw new Error(
        `Practice public media storage is not writable at ${storage.root} (driver=${storage.driver}). ${message}`
      );
    }
    console.warn(`[practice-media-storage] Could not verify writable root ${storage.root}; continuing`);
  }
}
