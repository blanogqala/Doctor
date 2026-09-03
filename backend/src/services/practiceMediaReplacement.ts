import fs from 'fs';
import path from 'path';
import type { PracticeMediaStorage } from './practiceMediaStorage';
import {
  deleteOwnedDoctorPhotoKey,
  deletePreviousDoctorPhoto,
  persistDoctorPhoto,
} from './practiceDoctorPhotoStorage';
import {
  deleteOwnedPracticeLogoKey,
  deletePreviousPracticeLogo,
  persistPracticeLogo,
} from './practiceLogoStorage';

/**
 * Safe compensating replacement: write new object → commit DB → delete previous.
 * On DB failure, best-effort delete the new orphan and rethrow.
 */
export async function commitDoctorPhotoReplacement(params: {
  practiceId: string;
  doctorId: string;
  buffer: Buffer;
  mime: string;
  previousStored: string | null;
  publicApiOrigin: string;
  storage?: PracticeMediaStorage;
  updateDatabase: (storageKey: string) => Promise<void>;
}): Promise<{ storageKey: string; publicUrl: string }> {
  const newMedia = await persistDoctorPhoto({
    practiceId: params.practiceId,
    doctorId: params.doctorId,
    buffer: params.buffer,
    mime: params.mime,
    publicApiOrigin: params.publicApiOrigin,
    storage: params.storage,
  });

  try {
    await params.updateDatabase(newMedia.storageKey);
  } catch (err) {
    await deleteOwnedDoctorPhotoKey({
      storageKey: newMedia.storageKey,
      practiceId: params.practiceId,
      doctorId: params.doctorId,
      storage: params.storage,
      reason: 'db_update_failed',
    });
    throw err;
  }

  await deletePreviousDoctorPhoto({
    previousStored: params.previousStored,
    practiceId: params.practiceId,
    doctorId: params.doctorId,
    excludeKey: newMedia.storageKey,
    storage: params.storage,
  });

  return newMedia;
}

export async function commitPracticeLogoReplacement(params: {
  practiceId: string;
  buffer: Buffer;
  mime: string;
  previousStored: string | null;
  publicApiOrigin: string;
  storage?: PracticeMediaStorage;
  updateDatabase: (storageKey: string) => Promise<void>;
}): Promise<{ storageKey: string; publicUrl: string }> {
  const newMedia = await persistPracticeLogo({
    practiceId: params.practiceId,
    buffer: params.buffer,
    mime: params.mime,
    publicApiOrigin: params.publicApiOrigin,
    storage: params.storage,
  });

  try {
    await params.updateDatabase(newMedia.storageKey);
  } catch (err) {
    await deleteOwnedPracticeLogoKey({
      storageKey: newMedia.storageKey,
      practiceId: params.practiceId,
      storage: params.storage,
      reason: 'db_update_failed',
    });
    throw err;
  }

  await deletePreviousPracticeLogo({
    previousStored: params.previousStored,
    practiceId: params.practiceId,
    excludeKey: newMedia.storageKey,
    storage: params.storage,
  });

  return newMedia;
}
