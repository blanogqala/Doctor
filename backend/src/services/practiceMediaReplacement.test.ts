import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPracticeMediaStorage, resetPracticeMediaStorageForTests } from './practiceMediaStorage';
import {
  commitDoctorPhotoReplacement,
  commitPracticeLogoReplacement,
} from './practiceMediaReplacement';
import {
  deletePreviousDoctorPhoto,
  isDoctorPhotoKeyOwned,
  persistDoctorPhoto,
} from './practiceDoctorPhotoStorage';
import {
  deletePreviousPracticeLogo,
  isLogoKeyOwnedByPractice,
  persistPracticeLogo,
} from './practiceLogoStorage';

/** 1×1 PNG */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

describe('commitDoctorPhotoReplacement ordering', () => {
  let root = '';

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'medinathi-replace-doctor-'));
    resetPracticeMediaStorageForTests();
  });

  afterEach(() => {
    resetPracticeMediaStorageForTests();
    fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('writes the new object before DB update and does not delete previous until after DB succeeds', async () => {
    const base = createPracticeMediaStorage({ driver: 'local', root });
    const originalDelete = base.delete.bind(base);
    const dbUpdateOrder: string[] = [];
    const storage = Object.assign(base, {
      delete: vi.fn(async (key: string) => {
        dbUpdateOrder.push(`delete:${key}`);
        return originalDelete(key);
      }),
    });

    const first = await persistDoctorPhoto({
      practiceId: 'prac-a',
      doctorId: 'doc-1',
      buffer: PNG_1X1,
      mime: 'image/png',
      publicApiOrigin: 'https://api.medinathi.co.za',
      storage,
    });

    const second = await commitDoctorPhotoReplacement({
      practiceId: 'prac-a',
      doctorId: 'doc-1',
      buffer: PNG_1X1,
      mime: 'image/png',
      previousStored: first.storageKey,
      publicApiOrigin: 'https://api.medinathi.co.za',
      storage,
      updateDatabase: async (storageKey) => {
        dbUpdateOrder.push(`db:${storageKey}`);
        expect(await storage.exists(first.storageKey)).toBe(true);
        expect(await storage.exists(storageKey)).toBe(true);
      },
    });

    expect(dbUpdateOrder[0]).toBe(`db:${second.storageKey}`);
    expect(dbUpdateOrder[1]).toBe(`delete:${first.storageKey}`);
    expect(await storage.exists(first.storageKey)).toBe(false);
    expect(await storage.exists(second.storageKey)).toBe(true);
  });

  it('keeps previous object and removes new orphan when DB update fails', async () => {
    const storage = createPracticeMediaStorage({ driver: 'local', root });
    const first = await persistDoctorPhoto({
      practiceId: 'prac-a',
      doctorId: 'doc-1',
      buffer: PNG_1X1,
      mime: 'image/png',
      publicApiOrigin: 'https://api.medinathi.co.za',
      storage,
    });

    let attemptedKey = '';
    await expect(
      commitDoctorPhotoReplacement({
        practiceId: 'prac-a',
        doctorId: 'doc-1',
        buffer: PNG_1X1,
        mime: 'image/png',
        previousStored: first.storageKey,
        publicApiOrigin: 'https://api.medinathi.co.za',
        storage,
        updateDatabase: async (storageKey) => {
          attemptedKey = storageKey;
          throw new Error('db write failed');
        },
      })
    ).rejects.toThrow('db write failed');

    expect(await storage.exists(first.storageKey)).toBe(true);
    expect(await storage.exists(attemptedKey)).toBe(false);
  });

  it('does not fail upload when previous cleanup fails after successful DB update', async () => {
    const storage = createPracticeMediaStorage({ driver: 'local', root });
    const first = await persistDoctorPhoto({
      practiceId: 'prac-a',
      doctorId: 'doc-1',
      buffer: PNG_1X1,
      mime: 'image/png',
      publicApiOrigin: 'https://api.medinathi.co.za',
      storage,
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failingStorage = Object.assign(storage, {
      delete: vi.fn().mockRejectedValue(new Error('cleanup failed')),
    });

    const result = await commitDoctorPhotoReplacement({
      practiceId: 'prac-a',
      doctorId: 'doc-1',
      buffer: PNG_1X1,
      mime: 'image/png',
      previousStored: first.storageKey,
      publicApiOrigin: 'https://api.medinathi.co.za',
      storage: failingStorage,
      updateDatabase: async () => {},
    });

    expect(result.storageKey).toBeTruthy();
    expect(await storage.exists(result.storageKey)).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
    const logged = warnSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('practice_doctor_photo_previous_cleanup_failed');
    warnSpy.mockRestore();
  });

  it('never deletes cross-practice or cross-doctor keys', async () => {
    const storage = createPracticeMediaStorage({ driver: 'local', root });
    const otherDoctorKey = 'practice/prac-a/doctors/doc-2/other.png';
    const otherPracticeKey = 'practice/prac-b/doctors/doc-1/other.png';
    await storage.put(otherDoctorKey, PNG_1X1);
    await storage.put(otherPracticeKey, PNG_1X1);

    await deletePreviousDoctorPhoto({
      previousStored: otherDoctorKey,
      practiceId: 'prac-a',
      doctorId: 'doc-1',
      storage,
    });
    await deletePreviousDoctorPhoto({
      previousStored: otherPracticeKey,
      practiceId: 'prac-a',
      doctorId: 'doc-1',
      storage,
    });

    expect(await storage.exists(otherDoctorKey)).toBe(true);
    expect(await storage.exists(otherPracticeKey)).toBe(true);
    expect(isDoctorPhotoKeyOwned(otherDoctorKey, 'prac-a', 'doc-1')).toBe(false);
    expect(isDoctorPhotoKeyOwned(otherPracticeKey, 'prac-a', 'doc-1')).toBe(false);
  });
});

describe('commitPracticeLogoReplacement ordering', () => {
  let root = '';

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'medinathi-replace-logo-'));
    resetPracticeMediaStorageForTests();
  });

  afterEach(() => {
    resetPracticeMediaStorageForTests();
    fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('writes new logo before DB update and deletes previous only after DB succeeds', async () => {
    const storage = createPracticeMediaStorage({ driver: 'local', root });
    const first = await persistPracticeLogo({
      practiceId: 'prac-a',
      buffer: PNG_1X1,
      mime: 'image/png',
      publicApiOrigin: 'https://api.medinathi.co.za',
      storage,
    });

    const order: string[] = [];
    const originalDelete = storage.delete.bind(storage);
    const tracked = Object.assign(storage, {
      delete: async (key: string) => {
        order.push(`delete:${key}`);
        return originalDelete(key);
      },
    });

    const second = await commitPracticeLogoReplacement({
      practiceId: 'prac-a',
      buffer: PNG_1X1,
      mime: 'image/png',
      previousStored: first.storageKey,
      publicApiOrigin: 'https://api.medinathi.co.za',
      storage: tracked,
      updateDatabase: async (storageKey) => {
        order.push(`db:${storageKey}`);
        expect(await storage.exists(first.storageKey)).toBe(true);
      },
    });

    expect(order[0]).toBe(`db:${second.storageKey}`);
    expect(order[1]).toBe(`delete:${first.storageKey}`);
    expect(await storage.exists(first.storageKey)).toBe(false);
    expect(await storage.exists(second.storageKey)).toBe(true);
  });

  it('keeps previous logo and removes new orphan when DB update fails', async () => {
    const storage = createPracticeMediaStorage({ driver: 'local', root });
    const first = await persistPracticeLogo({
      practiceId: 'prac-a',
      buffer: PNG_1X1,
      mime: 'image/png',
      publicApiOrigin: 'https://api.medinathi.co.za',
      storage,
    });

    let attemptedKey = '';
    await expect(
      commitPracticeLogoReplacement({
        practiceId: 'prac-a',
        buffer: PNG_1X1,
        mime: 'image/png',
        previousStored: first.storageKey,
        publicApiOrigin: 'https://api.medinathi.co.za',
        storage,
        updateDatabase: async (storageKey) => {
          attemptedKey = storageKey;
          throw new Error('db write failed');
        },
      })
    ).rejects.toThrow('db write failed');

    expect(await storage.exists(first.storageKey)).toBe(true);
    expect(await storage.exists(attemptedKey)).toBe(false);
  });

  it('does not fail upload when previous logo cleanup fails after DB success', async () => {
    const storage = createPracticeMediaStorage({ driver: 'local', root });
    const first = await persistPracticeLogo({
      practiceId: 'prac-a',
      buffer: PNG_1X1,
      mime: 'image/png',
      publicApiOrigin: 'https://api.medinathi.co.za',
      storage,
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failingStorage = Object.assign(storage, {
      delete: vi.fn().mockRejectedValue(new Error('cleanup failed')),
    });

    const result = await commitPracticeLogoReplacement({
      practiceId: 'prac-a',
      buffer: PNG_1X1,
      mime: 'image/png',
      previousStored: first.storageKey,
      publicApiOrigin: 'https://api.medinathi.co.za',
      storage: failingStorage,
      updateDatabase: async () => {},
    });

    expect(result.storageKey).toBeTruthy();
    expect(await storage.exists(result.storageKey)).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
    const logged = warnSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('practice_logo_previous_cleanup_failed');
    warnSpy.mockRestore();
  });

  it('never deletes cross-practice logo keys', async () => {
    const storage = createPracticeMediaStorage({ driver: 'local', root });
    const otherKey = 'practice/prac-b/logos/other.png';
    await storage.put(otherKey, PNG_1X1);

    await deletePreviousPracticeLogo({
      previousStored: otherKey,
      practiceId: 'prac-a',
      storage,
    });

    expect(await storage.exists(otherKey)).toBe(true);
    expect(isLogoKeyOwnedByPractice(otherKey, 'prac-a')).toBe(false);
  });
});

describe('persistDoctorPhoto write-only semantics', () => {
  let root = '';

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'medinathi-persist-doctor-'));
    resetPracticeMediaStorageForTests();
  });

  afterEach(() => {
    resetPracticeMediaStorageForTests();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('does not delete a previous object during persist', async () => {
    const storage = createPracticeMediaStorage({ driver: 'local', root });
    const first = await persistDoctorPhoto({
      practiceId: 'prac-a',
      doctorId: 'doc-1',
      buffer: PNG_1X1,
      mime: 'image/png',
      publicApiOrigin: 'https://api.medinathi.co.za',
      storage,
    });

    const second = await persistDoctorPhoto({
      practiceId: 'prac-a',
      doctorId: 'doc-1',
      buffer: PNG_1X1,
      mime: 'image/png',
      publicApiOrigin: 'https://api.medinathi.co.za',
      storage,
    });

    expect(second.storageKey).not.toBe(first.storageKey);
    expect(await storage.exists(first.storageKey)).toBe(true);
    expect(await storage.exists(second.storageKey)).toBe(true);
  });
});

describe('persistPracticeLogo write-only semantics', () => {
  let root = '';

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'medinathi-persist-logo-'));
    resetPracticeMediaStorageForTests();
  });

  afterEach(() => {
    resetPracticeMediaStorageForTests();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('does not delete a previous object during persist', async () => {
    const storage = createPracticeMediaStorage({ driver: 'local', root });
    const first = await persistPracticeLogo({
      practiceId: 'prac-a',
      buffer: PNG_1X1,
      mime: 'image/png',
      publicApiOrigin: 'https://api.medinathi.co.za',
      storage,
    });

    const second = await persistPracticeLogo({
      practiceId: 'prac-a',
      buffer: PNG_1X1,
      mime: 'image/png',
      publicApiOrigin: 'https://api.medinathi.co.za',
      storage,
    });

    expect(second.storageKey).not.toBe(first.storageKey);
    expect(await storage.exists(first.storageKey)).toBe(true);
    expect(await storage.exists(second.storageKey)).toBe(true);
  });
});
