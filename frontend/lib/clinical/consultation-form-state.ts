import { normalizeDoctorNotes } from '@/lib/doctor-notes';
import { clinicalFormFromRecord } from '@/lib/clinical-form';
import type { AiFieldProvenanceMap } from '@/lib/ai-merge';
import type { MedicalRecord, ReferralUrgency } from '@/lib/types';
import type { ClinicalForm } from '@/lib/clinical-form';
import type { DoctorPrivateNote } from '@/lib/types';
import type { MedicationSaveItem, ReferralSaveState, ClinicalLetterSaveState } from './consultation-save-payload';
import { parseClinicalLetterSave } from './consultation-save-payload';

export interface ConsultationFormState {
  clinical: ClinicalForm;
  privateNotes: DoctorPrivateNote[];
  medications: MedicationSaveItem[];
  referral: ReferralSaveState;
  clinicalLetter: ClinicalLetterSaveState;
  aiProvenance: AiFieldProvenanceMap;
}

export function medicalRecordToFormState(rec: MedicalRecord): ConsultationFormState {
  const provenance = (rec.ai_field_provenance as AiFieldProvenanceMap | null) ?? {};
  const ref = rec.referrals?.[0];

  return {
    clinical: clinicalFormFromRecord(rec),
    privateNotes: normalizeDoctorNotes(rec.doctor_notes_private),
    medications: (rec.prescriptions ?? []).map((p) => ({
      id: p.id,
      drug_name: p.drug_name,
      generic_name: p.generic_name ?? '',
      brand_name: p.brand_name ?? '',
      strength: p.strength ?? p.dosage ?? '',
      dosage_form: p.dosage_form ?? '',
      route: p.route ?? 'Oral',
      frequency: p.frequency,
      duration_value: p.duration?.split(' ')[0] ?? '',
      duration_unit: p.duration?.split(' ').slice(1).join(' ') || 'Days',
      duration: p.duration ?? '',
      instructions: p.instructions ?? '',
      is_prn: p.is_prn,
      quantity: p.quantity != null ? String(p.quantity) : '',
    })),
    referral: ref
      ? {
          referred_to: ref.referred_to,
          specialty: ref.specialty ?? '',
          institution: ref.referred_to_institution ?? '',
          contact: ref.referred_to_contact ?? '',
          reason: ref.reason,
          urgency: (ref.urgency as ReferralUrgency) || 'ROUTINE',
          clinical_summary: ref.clinical_summary ?? '',
          specific_questions: ref.specific_questions ?? '',
        }
      : {
          referred_to: '',
          specialty: '',
          institution: '',
          contact: '',
          reason: '',
          urgency: 'ROUTINE',
          clinical_summary: '',
          specific_questions: '',
        },
    clinicalLetter: parseClinicalLetterSave(rec.clinical_letters),
    aiProvenance: provenance,
  };
}

export const LEGACY_CLINICAL_DRAFT_PREFIX = 'clinical-draft-';

export function legacyClinicalDraftKey(patientId: string): string {
  return `${LEGACY_CLINICAL_DRAFT_PREFIX}${patientId}`;
}

export function clearLegacyClinicalDraft(patientId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(legacyClinicalDraftKey(patientId));
}
