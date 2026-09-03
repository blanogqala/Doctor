import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildPracticeLogoKey,
  createPracticeLogoStorage,
  isLogoKeyOwnedByPractice,
  parseStoredPracticeLogo,
  persistPracticeLogo,
  resetPracticeLogoStorageForTests,
  resolvePublicApiOrigin,
  resolvePublicPracticeLogoUrl,
  toAbsolutePublicAssetUrl,
} from './practiceLogoStorage';
import { createPracticeMediaStorage } from './practiceMediaStorage';
import { commitPracticeLogoReplacement } from './practiceMediaReplacement';

/** 1×1 PNG */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

describe('practice logo keys', () => {
  it('builds tenant-qualified unique keys', () => {
    const a = buildPracticeLogoKey('prac-a', 'png');
    const b = buildPracticeLogoKey('prac-a', 'png');
    expect(a).toMatch(/^practice\/prac-a\/logos\/[A-Za-z0-9_-]+\.png$/);
    expect(a).not.toBe(b);
    expect(isLogoKeyOwnedByPractice(a, 'prac-a')).toBe(true);
    expect(isLogoKeyOwnedByPractice(a, 'prac-b')).toBe(false);
  });

  it('rejects cross-tenant keys', () => {
    expect(isLogoKeyOwnedByPractice('practice/prac-b/logos/file.png', 'prac-a')).toBe(false);
    expect(isLogoKeyOwnedByPractice('practice/prac-a/logos/../b/x.png', 'prac-a')).toBe(false);
  });
});

describe('parseStoredPracticeLogo', () => {
  it('parses storage keys', () => {
    const parsed = parseStoredPracticeLogo('practice/abc/logos/file.webp');
    expect(parsed).toEqual({
      kind: 'key',
      key: 'practice/abc/logos/file.webp',
      practiceId: 'abc',
      filename: 'file.webp',
    });
  });

  it('parses legacy relative API paths', () => {
    const parsed = parseStoredPracticeLogo('/api/practice/logo-file/1788357557583-dony7ex2z44.jpg');
    expect(parsed).toEqual({
      kind: 'legacy-file',
      filename: '1788357557583-dony7ex2z44.jpg',
    });
  });

  it('parses absolute API URLs into keys', () => {
    const parsed = parseStoredPracticeLogo(
      'https://api.medinathi.co.za/api/public/practice-logos/abc/file.png'
    );
    expect(parsed).toMatchObject({
      kind: 'key',
      practiceId: 'abc',
      filename: 'file.png',
    });
  });

  it('treats unknown /uploads paths as unusable', () => {
    expect(parseStoredPracticeLogo('/uploads/logo.png')).toBeNull();
  });
});

describe('toAbsolutePublicAssetUrl', () => {
  it('prefixes relative paths with the API origin, not the frontend origin', () => {
    expect(toAbsolutePublicAssetUrl('/api/practice/logo-file/x.png', 'https://api.medinathi.co.za')).toBe(
      'https://api.medinathi.co.za/api/practice/logo-file/x.png'
    );
    expect(toAbsolutePublicAssetUrl('/uploads/logo.png', 'https://api.medinathi.co.za')).not.toContain(
      'pilot.medinathi.co.za'
    );
  });

  it('passes through absolute URLs', () => {
    expect(toAbsolutePublicAssetUrl('https://cdn.example/logo.png', 'https://api.medinathi.co.za')).toBe(
      'https://cdn.example/logo.png'
    );
  });
});

describe('resolvePublicApiOrigin', () => {
  it('prefers PUBLIC_API_URL', () => {
    expect(
      resolvePublicApiOrigin({
        configured: 'https://api.medinathi.co.za/',
        host: 'localhost:3001',
        proto: 'http',
      })
    ).toBe('https://api.medinathi.co.za');
  });

  it('falls back to request host', () => {
    expect(resolvePublicApiOrigin({ host: 'api.medinathi.co.za', proto: 'https' })).toBe(
      'https://api.medinathi.co.za'
    );
  });
});

describe('FilesystemPracticeLogoStorage', () => {
  let root = '';

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'medinathi-logos-'));
    resetPracticeLogoStorageForTests();
  });

  afterEach(() => {
    resetPracticeLogoStorageForTests();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('uploads and replaces via commit after DB success', async () => {
    const storage = createPracticeLogoStorage({ driver: 'local', root });
    const first = await persistPracticeLogo({
      practiceId: 'prac-a',
      buffer: PNG_1X1,
      mime: 'image/png',
      publicApiOrigin: 'https://api.medinathi.co.za',
      storage,
    });

    expect(first.storageKey.startsWith('practice/prac-a/logos/')).toBe(true);
    expect(first.publicUrl).toMatch(
      /^https:\/\/api\.medinathi\.co\.za\/api\/public\/practice-logos\/prac-a\/.+\.png$/
    );
    expect(await storage.exists(first.storageKey)).toBe(true);

    const second = await commitPracticeLogoReplacement({
      practiceId: 'prac-a',
      buffer: PNG_1X1,
      mime: 'image/png',
      previousStored: first.storageKey,
      publicApiOrigin: 'https://api.medinathi.co.za',
      storage,
      updateDatabase: async () => {},
    });
    expect(second.storageKey).not.toBe(first.storageKey);
    expect(await storage.exists(first.storageKey)).toBe(false);
    expect(await storage.exists(second.storageKey)).toBe(true);

    const other = await persistPracticeLogo({
      practiceId: 'prac-b',
      buffer: PNG_1X1,
      mime: 'image/png',
      publicApiOrigin: 'https://api.medinathi.co.za',
      storage,
    });
    await commitPracticeLogoReplacement({
      practiceId: 'prac-a',
      buffer: PNG_1X1,
      mime: 'image/png',
      previousStored: other.storageKey,
      publicApiOrigin: 'https://api.medinathi.co.za',
      storage,
      updateDatabase: async () => {},
    });
    expect(await storage.exists(other.storageKey)).toBe(true);
  });

  it('returns an absolute public URL only when the object exists', async () => {
    const storage = createPracticeLogoStorage({ driver: 'local', root });
    const uploaded = await persistPracticeLogo({
      practiceId: 'prac-a',
      buffer: PNG_1X1,
      mime: 'image/png',
      publicApiOrigin: 'https://api.medinathi.co.za',
      storage,
    });

    await expect(
      resolvePublicPracticeLogoUrl({
        stored: uploaded.storageKey,
        practiceId: 'prac-a',
        publicApiOrigin: 'https://api.medinathi.co.za',
        storage,
      })
    ).resolves.toBe(uploaded.publicUrl);

    await expect(
      resolvePublicPracticeLogoUrl({
        stored: uploaded.storageKey,
        practiceId: 'prac-b',
        publicApiOrigin: 'https://api.medinathi.co.za',
        storage,
      })
    ).resolves.toBeNull();
  });

  it('returns null for missing legacy local files instead of a broken URL', async () => {
    const storage = createPracticeLogoStorage({ driver: 'local', root });
    await expect(
      resolvePublicPracticeLogoUrl({
        stored: '/api/practice/logo-file/1788357557583-dony7ex2z44.jpg',
        practiceId: '2452d91b-af4f-4dcb-a772-f056b36c764b',
        publicApiOrigin: 'https://api.medinathi.co.za',
        storage,
        legacyExists: () => false,
      })
    ).resolves.toBeNull();
  });

  it('returns an absolute URL for leftover local files that still exist', async () => {
    const storage = createPracticeLogoStorage({ driver: 'local', root });
    await expect(
      resolvePublicPracticeLogoUrl({
        stored: '/api/practice/logo-file/still-here.png',
        practiceId: 'prac-a',
        publicApiOrigin: 'https://api.medinathi.co.za',
        storage,
        legacyExists: (filename) => filename === 'still-here.png',
      })
    ).resolves.toBe('https://api.medinathi.co.za/api/practice/logo-file/still-here.png');
  });

  it('resolves logos written under a legacy fallback root', async () => {
    const primaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'medinathi-logo-primary-'));
    const legacyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'medinathi-logo-legacy-'));
    try {
      const key = 'practice/prac-a/logos/fallback.png';
      const legacyPath = path.join(legacyRoot, key);
      fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
      fs.writeFileSync(legacyPath, PNG_1X1);

      const withFallback = createPracticeMediaStorage({
        driver: 'local',
        root: primaryRoot,
        legacyLogoRoot: legacyRoot,
      });

      await expect(
        resolvePublicPracticeLogoUrl({
          stored: key,
          practiceId: 'prac-a',
          publicApiOrigin: 'https://api.medinathi.co.za',
          storage: withFallback,
        })
      ).resolves.toMatch(
        /^https:\/\/api\.medinathi\.co\.za\/api\/public\/practice-logos\/prac-a\/fallback\.png$/
      );
    } finally {
      fs.rmSync(primaryRoot, { recursive: true, force: true });
      fs.rmSync(legacyRoot, { recursive: true, force: true });
    }
  });
});
