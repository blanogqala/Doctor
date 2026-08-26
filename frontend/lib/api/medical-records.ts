import { apiFetch, apiFormFetch, csrfStorage, getApiBaseUrl, getTenantHeader } from '../api';
import type { MedicalRecord, MedicalRecordAmendment } from '../types';

export const medicalRecordsApi = {
  list: (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : '';
    return apiFetch<MedicalRecord[]>(`/api/medical-records${query}`);
  },
  getById: (id: string) => apiFetch<MedicalRecord>(`/api/medical-records/${id}`),
  create: (data: Record<string, unknown>) =>
    apiFetch<MedicalRecord>('/api/medical-records', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Record<string, unknown>) =>
    apiFetch<MedicalRecord>(`/api/medical-records/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  addAmendment: (id: string, correction_note: string) =>
    apiFetch<MedicalRecordAmendment>(`/api/medical-records/${id}/amendments`, {
      method: 'POST',
      body: JSON.stringify({ correction_note }),
    }),
  count: (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : '';
    return apiFetch<{ count: number }>(`/api/medical-records/count${query}`);
  },

  uploadConsultationRecording: async (params: {
    recordId: string;
    audio: Blob;
    transcript: string;
    consentId: string;
    detectedLanguage?: string | null;
    warnings?: string[];
    confidence?: Record<string, number>;
    filename?: string;
  }): Promise<MedicalRecord> => {
    const form = new FormData();
    form.append('audio', params.audio, params.filename ?? 'consultation.webm');
    form.append('transcript', params.transcript);
    form.append('consentId', params.consentId);
    if (params.detectedLanguage) {
      form.append('detectedLanguage', params.detectedLanguage);
    }
    form.append('warnings', JSON.stringify(params.warnings ?? []));
    form.append('confidence', JSON.stringify(params.confidence ?? {}));

    return apiFormFetch<MedicalRecord>(
      `/api/medical-records/${params.recordId}/consultation-recording`,
      form,
      { method: 'POST' }
    );
  },

  /** Fetch consultation audio as a blob URL (caller must revoke). Doctor-only. */
  fetchConsultationAudioObjectUrl: async (recordId: string): Promise<string> => {
    const csrf = csrfStorage.get();
    const res = await fetch(
      `${getApiBaseUrl()}/api/medical-records/${recordId}/consultation-audio`,
      {
      credentials: 'include',
      headers: {
        ...getTenantHeader(),
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
    }
    );
    if (!res.ok) {
      let message = 'Failed to load consultation audio';
      try {
        const body = await res.json();
        message = body.error || message;
      } catch {
        // ignore
      }
      throw new Error(message);
    }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },
};
