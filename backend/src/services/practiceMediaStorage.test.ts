import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertSafeMediaKey,
  createPracticeMediaStorage,
  FilesystemPracticeMediaStorage,
  resetPracticeMediaStorageForTests,
  resolvePracticeMediaRoot,
} from './practiceMediaStorage';

/** 1×1 PNG */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

describe('resolvePracticeMediaRoot', () => {
  it('defaults render-disk to /var/data/public-media', () => {
    expect(resolvePracticeMediaRoot('render-disk')).toBe(path.resolve('/var/data/public-media'));
  });

  it('defaults local to cwd/uploads/public-media', () => {
    expect(resolvePracticeMediaRoot('local')).toBe(
      path.resolve(process.cwd(), 'uploads', 'public-media')
    );
  });

  it('honours an explicit configured root', () => {
    expect(resolvePracticeMediaRoot('render-disk', '/custom/media')).toBe(
      path.resolve('/custom/media')
    );
  });
});

describe('assertSafeMediaKey', () => {
  it('rejects path traversal and absolute keys', () => {
    expect(() => assertSafeMediaKey('../etc/passwd')).toThrow(/Invalid practice media storage key/);
    expect(() => assertSafeMediaKey('/etc/passwd')).toThrow(/Invalid practice media storage key/);
    expect(assertSafeMediaKey('practice/p/logos/file.png')).toBe('practice/p/logos/file.png');
  });
});

describe('FilesystemPracticeMediaStorage fallback roots', () => {
  let primaryRoot = '';
  let fallbackRoot = '';

  beforeEach(() => {
    primaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'medinathi-media-primary-'));
    fallbackRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'medinathi-media-fallback-'));
    resetPracticeMediaStorageForTests();
  });

  afterEach(() => {
    resetPracticeMediaStorageForTests();
    fs.rmSync(primaryRoot, { recursive: true, force: true });
    fs.rmSync(fallbackRoot, { recursive: true, force: true });
  });

  it('reads objects from a fallback root when absent from primary', async () => {
    const key = 'practice/prac-a/logos/legacy.png';
    const fallbackPath = path.join(fallbackRoot, key);
    fs.mkdirSync(path.dirname(fallbackPath), { recursive: true });
    fs.writeFileSync(fallbackPath, PNG_1X1);

    const storage = new FilesystemPracticeMediaStorage('local', primaryRoot, [fallbackRoot]);
    expect(await storage.exists(key)).toBe(true);
  });

  it('writes only to the primary root, never the fallback', async () => {
    const storage = new FilesystemPracticeMediaStorage('local', primaryRoot, [fallbackRoot]);
    const key = 'practice/prac-a/logos/new.png';
    await storage.put(key, PNG_1X1);

    expect(fs.existsSync(path.join(primaryRoot, key))).toBe(true);
    expect(fs.existsSync(path.join(fallbackRoot, key))).toBe(false);
  });

  it('deletes from both primary and fallback roots', async () => {
    const key = 'practice/prac-a/logos/shared.png';
    const primaryPath = path.join(primaryRoot, key);
    const fallbackPath = path.join(fallbackRoot, key);
    fs.mkdirSync(path.dirname(primaryPath), { recursive: true });
    fs.mkdirSync(path.dirname(fallbackPath), { recursive: true });
    fs.writeFileSync(primaryPath, PNG_1X1);
    fs.writeFileSync(fallbackPath, PNG_1X1);

    const storage = new FilesystemPracticeMediaStorage('local', primaryRoot, [fallbackRoot]);
    await storage.delete(key);
    expect(fs.existsSync(primaryPath)).toBe(false);
    expect(fs.existsSync(fallbackPath)).toBe(false);
  });

  it('createPracticeMediaStorage wires legacy logo root as fallback', async () => {
    const key = 'practice/prac-a/logos/old.png';
    const legacyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'medinathi-legacy-logos-'));
    try {
      const legacyPath = path.join(legacyRoot, key);
      fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
      fs.writeFileSync(legacyPath, PNG_1X1);

      const storage = createPracticeMediaStorage({
        driver: 'local',
        root: primaryRoot,
        legacyLogoRoot: legacyRoot,
      });
      expect(await storage.exists(key)).toBe(true);
    } finally {
      fs.rmSync(legacyRoot, { recursive: true, force: true });
    }
  });
});
