import fs from 'fs';
import path from 'path';
import { createReadStream } from 'fs';
import {
  assertSafeStorageKey,
  type ClinicalStorage,
  type ClinicalStorageDriverName,
} from './types';

/**
 * Filesystem-backed private clinical storage.
 * Used for both local development (`local`) and Render Persistent Disk (`render-disk`).
 * The drivers share implementation; only root/validation policy differs at factory time.
 */
export class FilesystemClinicalStorage implements ClinicalStorage {
  readonly driver: ClinicalStorageDriverName;
  readonly root: string;

  constructor(driver: ClinicalStorageDriverName, root: string) {
    this.driver = driver;
    this.root = path.resolve(root);
  }

  absolutePath(key: string): string {
    const safe = assertSafeStorageKey(key);
    const resolved = path.resolve(this.root, safe);
    const rootWithSep = this.root.endsWith(path.sep) ? this.root : this.root + path.sep;
    if (resolved !== this.root && !resolved.startsWith(rootWithSep)) {
      throw new Error('Clinical storage path escape blocked');
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
      throw new Error('Clinical object not found');
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

  /**
   * Ensure root exists and is writable. Used for Render disk startup validation.
   */
  async assertWritable(): Promise<void> {
    await fs.promises.mkdir(this.root, { recursive: true });
    const probe = path.join(this.root, `.write-probe-${Date.now()}`);
    await fs.promises.writeFile(probe, 'ok');
    await fs.promises.unlink(probe);
  }
}
