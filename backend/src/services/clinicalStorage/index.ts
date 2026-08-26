import path from 'path';
import { env } from '../../config/env';
import { resolveAppEnv } from '../../config/appEnv';
import { FilesystemClinicalStorage } from './filesystemStorage';
import type { ClinicalStorage, ClinicalStorageDriverName } from './types';


export {
  assertSafeStorageKey,
  buildClinicalObjectKey,
  isLegacyConsultationKey,
} from './types';
export type { ClinicalStorage, ClinicalStorageDriverName } from './types';
export { FilesystemClinicalStorage } from './filesystemStorage';

let singleton: ClinicalStorage | null = null;

export function resolveClinicalStorageRoot(
  driver: ClinicalStorageDriverName,
  configuredRoot?: string | null
): string {
  if (configuredRoot && configuredRoot.trim()) {
    return path.resolve(configuredRoot.trim());
  }
  if (driver === 'render-disk') {
    return path.resolve('/var/data/clinical');
  }
  return path.resolve(process.cwd(), 'uploads', 'clinical');
}

export function createClinicalStorage(options?: {
  driver?: ClinicalStorageDriverName;
  root?: string | null;
}): ClinicalStorage {
  const driver = options?.driver ?? env.CLINICAL_STORAGE_DRIVER;
  const root = resolveClinicalStorageRoot(driver, options?.root ?? env.CLINICAL_STORAGE_ROOT);
  return new FilesystemClinicalStorage(driver, root);
}

export function getClinicalStorage(): ClinicalStorage {
  if (!singleton) {
    singleton = createClinicalStorage();
  }
  return singleton;
}

/** Test helper — inject or clear singleton. */
export function resetClinicalStorageForTests(storage?: ClinicalStorage | null) {
  singleton = storage === undefined ? null : storage;
}

export async function validateClinicalStorageAtStartup(): Promise<void> {
  const storage = getClinicalStorage();
  const appEnv = resolveAppEnv();
  const requiresStrict =
    storage.driver === 'render-disk' && (appEnv === 'staging' || appEnv === 'production');

  if (requiresStrict) {
    try {
      await (storage as FilesystemClinicalStorage).assertWritable();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Private clinical storage is not writable at ${storage.root} (driver=${storage.driver}). ${message}`
      );
    }
    return;
  }

  if (storage instanceof FilesystemClinicalStorage) {
    try {
      await storage.assertWritable();
    } catch {
      console.warn(
        `[clinical-storage] Could not verify writable root ${storage.root}; continuing`
      );
    }
  }
}
