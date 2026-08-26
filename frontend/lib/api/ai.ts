import { ApiError, apiFetch, apiFormFetch } from '@/lib/api';

export interface ScribeVitals {
  bp_systolic?: string;
  bp_diastolic?: string;
  hr?: string;
  temp?: string;
  rr?: string;
  spo2?: string;
  weight?: string;
  height?: string;
}

export interface ScribeSuggestions {
  chief_complaint?: string;
  history_present_illness?: string;
  review_of_systems?: Record<string, boolean>;
  vitals?: ScribeVitals;
  general_appearance?: string;
  physical_exam_notes?: string;
  primary_diagnosis?: string;
  icd10_codes?: string;
  differential_diagnoses?: string;
  severity?: string;
  assessment?: string;
  plan?: string;
  lifestyle_advice?: string;
  follow_up_date?: string;
}

export type ScribeConfidenceScores = Record<string, number>;

export interface ConsultationScribeResult {
  success: boolean;
  transcript: string;
  detectedLanguage: string | null;
  suggestions: ScribeSuggestions;
  confidenceScores: ScribeConfidenceScores;
  warnings: string[];
  models?: { asr: string; llm: string };
}

export const aiApi = {
  async createRecordingConsent(params: {
    patient_id: string;
    medical_record_id?: string | null;
    appointment_id?: string | null;
    consent_mode: 'CONSULTATION' | 'DICTATION';
    consent_text_hash?: string | null;
  }): Promise<{ id: string; consented_at: string }> {
    return apiFetch('/api/ai/recording-consent', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async consultationScribe(params: {
    audio: Blob;
    patientId: string;
    consentId: string;
    medicalRecordId?: string | null;
    consentMode?: 'CONSULTATION' | 'DICTATION';
    languageHint?: string;
    filename?: string;
  }): Promise<ConsultationScribeResult> {
    const form = new FormData();
    const filename = params.filename ?? 'consultation.webm';
    form.append('audio', params.audio, filename);
    form.append('patientId', params.patientId);
    form.append('consentId', params.consentId);
    form.append('consentMode', params.consentMode ?? 'CONSULTATION');
    if (params.medicalRecordId) {
      form.append('medicalRecordId', params.medicalRecordId);
    }
    if (params.languageHint) {
      form.append('languageHint', params.languageHint);
    }

    try {
      return await apiFormFetch<ConsultationScribeResult>(
        '/api/ai/consultation-scribe',
        form,
        { method: 'POST' }
      );
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(
        err instanceof Error ? err.message : 'AI Clinical Assistant failed',
        500
      );
    }
  },

  async suggestionDecision(params: {
    patient_id: string;
    medical_record_id?: string | null;
    decision: 'ACCEPTED' | 'REJECTED';
    fields: string[];
  }): Promise<{ ok: boolean }> {
    return apiFetch('/api/ai/suggestion-decision', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async referralEnhance(params: {
    letter: string;
    patientId: string;
  }): Promise<{ letter: string; status: string }> {
    return apiFetch('/api/ai/referral-enhance', {
      method: 'POST',
      body: JSON.stringify({ letter: params.letter, patientId: params.patientId }),
    });
  },

  async referralDraft(params: {
    patientId: string;
    patientDisplayName: string;
    letterDate?: string | null;
    ageOrDobHint?: string | null;
    gender?: string | null;
    referringDoctor?: {
      fullName?: string | null;
      practiceName?: string | null;
      specialization?: string | null;
      phone?: string | null;
      email?: string | null;
      hpcsa?: string | null;
    } | null;
    patient?: {
      displayName?: string | null;
      dateOfBirthOrAge?: string | null;
      gender?: string | null;
      phone?: string | null;
      email?: string | null;
      addressLine?: string | null;
      allergies?: string | null;
      medicalHistory?: string | null;
    } | null;
    clinical: Record<string, string | null | undefined>;
    referral: {
      referred_to?: string | null;
      specialty?: string | null;
      institution?: string | null;
      contact?: string | null;
      reason?: string | null;
      urgency?: string | null;
      urgencyLabel?: string | null;
      specific_questions?: string | null;
    };
  }): Promise<{ letter: string; status: string }> {
    return apiFetch('/api/ai/referral-draft', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async clinicalLetterDraft(params: {
    patient_id: string;
    document_type: 'MEDICAL_CERTIFICATE' | 'WORK_ATTENDANCE' | 'SCHOOL_ATTENDANCE';
    patient_display_name: string;
    doctor_display_name?: string | null;
    practice_name?: string | null;
    letter_date?: string | null;
    absence_start?: string | null;
    absence_end?: string | null;
    restrictions?: string | null;
    include_diagnosis?: boolean;
    diagnosis_text?: string | null;
    doctor_notes?: string | null;
  }): Promise<{ letter: string; status: string; document_type: string }> {
    return apiFetch('/api/ai/clinical-letter-draft', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },
};
