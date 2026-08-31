'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api';
import { medicalRecordsApi } from '@/lib/api/medical-records';
import type { MedicalRecord } from '@/lib/types';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const DEBOUNCE_MS = 2000;

export interface UseConsultationAutosaveOptions {
  recordId: string | null;
  enabled: boolean;
  hasChanges: boolean;
  /** Incremented on each local edit. Used so a save does not clear newer unsaved typing. */
  dirtySeq?: number;
  buildPayload: () => Record<string, unknown>;
  onRecordCreated: (record: MedicalRecord) => void;
  onServerRecordLoaded?: (record: MedicalRecord) => void;
  onSaved?: (record: MedicalRecord) => void;
}

function conflictRecord(err: unknown): MedicalRecord | undefined {
  if (!(err instanceof ApiError) || err.status !== 409) return undefined;
  const body = err.data as { record?: MedicalRecord } | undefined;
  return body?.record;
}

export function useConsultationAutosave({
  recordId,
  enabled,
  hasChanges,
  dirtySeq = 0,
  buildPayload,
  onRecordCreated,
  onServerRecordLoaded,
  onSaved,
}: UseConsultationAutosaveOptions) {
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [paused, setPausedState] = useState(false);
  const expectedUpdatedAtRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const pausedRef = useRef(false);
  const recordIdRef = useRef(recordId);
  const dirtySeqRef = useRef(dirtySeq);
  const buildPayloadRef = useRef(buildPayload);
  const onRecordCreatedRef = useRef(onRecordCreated);
  const onServerRecordLoadedRef = useRef(onServerRecordLoaded);
  const onSavedRef = useRef(onSaved);

  useEffect(() => {
    recordIdRef.current = recordId;
  }, [recordId]);

  useEffect(() => {
    dirtySeqRef.current = dirtySeq;
  }, [dirtySeq]);

  useEffect(() => {
    buildPayloadRef.current = buildPayload;
    onRecordCreatedRef.current = onRecordCreated;
    onServerRecordLoadedRef.current = onServerRecordLoaded;
    onSavedRef.current = onSaved;
  });

  const performSave = useCallback(async () => {
    if (!enabled || savingRef.current || pausedRef.current) return;
    savingRef.current = true;
    setStatus('saving');
    const seqAtStart = dirtySeqRef.current;

    const payload = () => ({
      ...buildPayloadRef.current(),
      autosave: true,
      is_draft: true,
      ...(expectedUpdatedAtRef.current
        ? { expected_updated_at: expectedUpdatedAtRef.current }
        : {}),
    });

    try {
      let saved: MedicalRecord;

      if (recordIdRef.current) {
        let attemptedRetry = false;
        while (true) {
          try {
            saved = await medicalRecordsApi.update(recordIdRef.current, payload());
            break;
          } catch (err) {
            const serverRecord = conflictRecord(err);
            if (!serverRecord) throw err;
            expectedUpdatedAtRef.current = serverRecord.updated_at;
            if (!attemptedRetry) {
              attemptedRetry = true;
              continue;
            }
            onServerRecordLoadedRef.current?.(serverRecord);
            setStatus('error');
            return;
          }
        }
      } else {
        saved = await medicalRecordsApi.create(payload());
        recordIdRef.current = saved.id;
        onRecordCreatedRef.current(saved);
      }

      expectedUpdatedAtRef.current = saved.updated_at;
      setLastSavedAt(saved.updated_at);
      setStatus('saved');
      if (dirtySeqRef.current === seqAtStart) {
        onSavedRef.current?.(saved);
      }
    } catch {
      setStatus('error');
    } finally {
      savingRef.current = false;
    }
  }, [enabled]);

  const retry = useCallback(() => {
    void performSave();
  }, [performSave]);

  useEffect(() => {
    if (!enabled || !hasChanges || paused) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void performSave();
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [enabled, hasChanges, paused, dirtySeq, performSave]);

  const setExpectedUpdatedAt = useCallback((value: string | null) => {
    expectedUpdatedAtRef.current = value;
  }, []);

  const setPaused = useCallback((value: boolean) => {
    pausedRef.current = value;
    setPausedState(value);
  }, []);

  const waitUntilIdle = useCallback(async () => {
    while (savingRef.current) {
      await new Promise((r) => setTimeout(r, 25));
    }
  }, []);

  return {
    status,
    lastSavedAt,
    retry,
    setExpectedUpdatedAt,
    setPaused,
    waitUntilIdle,
    performSave,
  };
}

export function autosaveStatusLabel(status: AutosaveStatus): string | null {
  switch (status) {
    case 'saving':
      return 'Saving…';
    case 'saved':
      return 'Saved';
    case 'error':
      return 'Save failed';
    default:
      return null;
  }
}
