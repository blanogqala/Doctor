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
  buildPayload: () => Record<string, unknown>;
  onRecordCreated: (record: MedicalRecord) => void;
  onServerRecordLoaded?: (record: MedicalRecord) => void;
}

export function useConsultationAutosave({
  recordId,
  enabled,
  hasChanges,
  buildPayload,
  onRecordCreated,
  onServerRecordLoaded,
}: UseConsultationAutosaveOptions) {
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const expectedUpdatedAtRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const recordIdRef = useRef(recordId);

  useEffect(() => {
    recordIdRef.current = recordId;
  }, [recordId]);

  const performSave = useCallback(async () => {
    if (!enabled || savingRef.current) return;
    savingRef.current = true;
    setStatus('saving');

    try {
      const payload = {
        ...buildPayload(),
        autosave: true,
        is_draft: true,
        ...(expectedUpdatedAtRef.current
          ? { expected_updated_at: expectedUpdatedAtRef.current }
          : {}),
      };

      let saved: MedicalRecord;

      if (recordIdRef.current) {
        try {
          saved = await medicalRecordsApi.update(recordIdRef.current, payload);
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) {
            const body = err.data as { record?: MedicalRecord } | undefined;
            if (body?.record) {
              onServerRecordLoaded?.(body.record);
              expectedUpdatedAtRef.current = body.record.updated_at;
            }
            setStatus('error');
            savingRef.current = false;
            return;
          }
          throw err;
        }
      } else {
        saved = await medicalRecordsApi.create(payload);
        recordIdRef.current = saved.id;
        onRecordCreated(saved);
      }

      expectedUpdatedAtRef.current = saved.updated_at;
      setLastSavedAt(saved.updated_at);
      setStatus('saved');
    } catch {
      setStatus('error');
    } finally {
      savingRef.current = false;
    }
  }, [enabled, buildPayload, onRecordCreated, onServerRecordLoaded]);

  const retry = useCallback(() => {
    void performSave();
  }, [performSave]);

  useEffect(() => {
    if (!enabled || !hasChanges) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void performSave();
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [enabled, hasChanges, buildPayload, performSave]);

  const setExpectedUpdatedAt = useCallback((value: string | null) => {
    expectedUpdatedAtRef.current = value;
  }, []);

  return {
    status,
    lastSavedAt,
    retry,
    setExpectedUpdatedAt,
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
