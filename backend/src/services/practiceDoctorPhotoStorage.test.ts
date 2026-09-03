import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPracticeMediaStorage, resetPracticeMediaStorageForTests } from './practiceMediaStorage';
import {
  buildDoctorPhotoKey,
  isDoctorPhotoKeyOwned,
  parseStoredDoctorPhoto,
  persistDoctorPhoto,
  resolvePublicDoctorPhotoUrl,
} from './practiceDoctorPhotoStorage';
import { commitDoctorPhotoReplacement } from './practiceMediaReplacement';

/** 1×1 PNG */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

describe('doctor photo keys', () => {
  it('builds tenant- and doctor-qualified unique keys', () => {
    const a = buildDoctorPhotoKey('prac-a', 'doc-1', 'png');
    const b = buildDoctorPhotoKey('prac-a', 'doc-1', 'png');
    expect(a).toMatch(/^practice\/prac-a\/doctors\/doc-1\/[A-Za-z0-9_-]+\.png$/);
    expect(a).not.toBe(b);
    expect(isDoctorPhotoKeyOwned(a, 'prac-a', 'doc-1')).toBe(true);
    expect(isDoctorPhotoKeyOwned(a, 'prac-b', 'doc-1')).toBe(false);
    expect(isDoctorPhotoKeyOwned(a, 'prac-a', 'doc-2')).toBe(false);
  });

  it('rejects cross-tenant and cross-doctor keys', () => {
    expect(
      isDoctorPhotoKeyOwned('practice/prac-b/doctors/doc-1/file.png', 'prac-a', 'doc-1')
    ).toBe(false);
    expect(
      isDoctorPhotoKeyOwned('practice/prac-a/doctors/doc-2/file.png', 'prac-a', 'doc-1')
    ).toBe(false);
    expect(
      isDoctorPhotoKeyOwned('practice/prac-a/doctors/doc-1/../doc-2/x.png', 'prac-a', 'doc-1')
    ).toBe(false);
  });
});

describe('parseStoredDoctorPhoto', () => {
  it('parses storage keys', () => {
    const parsed = parseStoredDoctorPhoto('practice/abc/doctors/doc-1/file.webp');
    expect(parsed).toEqual({
      kind: 'key',
      key: 'practice/abc/doctors/doc-1/file.webp',
      practiceId: 'abc',
      doctorId: 'doc-1',
      filename: 'file.webp',
    });
  });

  it('parses legacy relative API paths', () => {
    const parsed = parseStoredDoctorPhoto('/api/practice/doctor-photo/1788357557583-photo.jpg');
    expect(parsed).toEqual({
      kind: 'legacy-file',
      filename: '1788357557583-photo.jpg',
    });
  });

  it('parses absolute public API URLs into keys', () => {
    const parsed = parseStoredDoctorPhoto(
      'https://api.medinathi.co.za/api/public/practice-doctor-photos/abc/doc-1/file.png'
    );
    expect(parsed).toMatchObject({
      kind: 'key',
      practiceId: 'abc',
      doctorId: 'doc-1',
      filename: 'file.png',
    });
  });
});

describe('persistDoctorPhoto', () => {
  let root = '';

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'medinathi-doctor-photos-'));
    resetPracticeMediaStorageForTests();
  });

  afterEach(() => {
    resetPracticeMediaStorageForTests();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('uploads and replaces via commit after DB success', async () => {
    const storage = createPracticeMediaStorage({ driver: 'local', root });
    const first = await persistDoctorPhoto({
      practiceId: 'prac-a',
      doctorId: 'doc-1',
      buffer: PNG_1X1,
      mime: 'image/png',
      publicApiOrigin: 'https://api.medinathi.co.za',
      storage,
    });

    expect(first.storageKey.startsWith('practice/prac-a/doctors/doc-1/')).toBe(true);
    expect(first.publicUrl).toMatch(
      /^https:\/\/api\.medinathi\.co\.za\/api\/public\/practice-doctor-photos\/prac-a\/doc-1\/.+\.png$/
    );

    const second = await commitDoctorPhotoReplacement({
      practiceId: 'prac-a',
      doctorId: 'doc-1',
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

    const otherDoctor = await persistDoctorPhoto({
      practiceId: 'prac-a',
      doctorId: 'doc-2',
      buffer: PNG_1X1,
      mime: 'image/png',
      publicApiOrigin: 'https://api.medinathi.co.za',
      storage,
    });
    await commitDoctorPhotoReplacement({
      practiceId: 'prac-a',
      doctorId: 'doc-1',
      buffer: PNG_1X1,
      mime: 'image/png',
      previousStored: otherDoctor.storageKey,
      publicApiOrigin: 'https://api.medinathi.co.za',
      storage,
      updateDatabase: async () => {},
    });
    expect(await storage.exists(otherDoctor.storageKey)).toBe(true);
  });

  it('returns an absolute public URL only when the object exists', async () => {
    const storage = createPracticeMediaStorage({ driver: 'local', root });
    const uploaded = await persistDoctorPhoto({
      practiceId: 'prac-a',
      doctorId: 'doc-1',
      buffer: PNG_1X1,
      mime: 'image/png',
      publicApiOrigin: 'https://api.medinathi.co.za',
      storage,
    });

    await expect(
      resolvePublicDoctorPhotoUrl({
        stored: uploaded.storageKey,
        practiceId: 'prac-a',
        doctorId: 'doc-1',
        publicApiOrigin: 'https://api.medinathi.co.za',
        storage,
      })
    ).resolves.toBe(uploaded.publicUrl);

    await expect(
      resolvePublicDoctorPhotoUrl({
        stored: uploaded.storageKey,
        practiceId: 'prac-b',
        doctorId: 'doc-1',
        publicApiOrigin: 'https://api.medinathi.co.za',
        storage,
      })
    ).resolves.toBeNull();

    await expect(
      resolvePublicDoctorPhotoUrl({
        stored: uploaded.storageKey,
        practiceId: 'prac-a',
        doctorId: 'doc-2',
        publicApiOrigin: 'https://api.medinathi.co.za',
        storage,
      })
    ).resolves.toBeNull();
  });

  it('returns null for missing legacy local files instead of a broken URL', async () => {
    const storage = createPracticeMediaStorage({ driver: 'local', root });
    await expect(
      resolvePublicDoctorPhotoUrl({
        stored: '/api/practice/doctor-photo/missing.jpg',
        practiceId: 'prac-a',
        doctorId: 'doc-1',
        publicApiOrigin: 'https://api.medinathi.co.za',
        storage,
        legacyExists: () => false,
      })
    ).resolves.toBeNull();
  });

  it('returns an absolute URL for leftover legacy files that still exist', async () => {
    const storage = createPracticeMediaStorage({ driver: 'local', root });
    await expect(
      resolvePublicDoctorPhotoUrl({
        stored: '/api/practice/doctor-photo/still-here.png',
        practiceId: 'prac-a',
        doctorId: 'doc-1',
        publicApiOrigin: 'https://api.medinathi.co.za',
        storage,
        legacyExists: (filename) => filename === 'still-here.png',
      })
    ).resolves.toBe('https://api.medinathi.co.za/api/practice/doctor-photo/still-here.png');
  });
});
