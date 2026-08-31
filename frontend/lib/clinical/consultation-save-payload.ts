import type { DoctorPrivateNote, ReferralUrgency } from '@/lib/types';
import {
  clinicalFormToApiPayload,
  type ClinicalForm,
} from '@/lib/clinical-form';
import type { AiFieldProvenanceMap } from '@/lib/ai-merge';

export interface MedicationSaveItem {
  id: string;
  drug_name: string;
  generic_name: string;
  brand_name: string;
  strength: string;
  dosage_form: string;
  route: string;
  frequency: string;
  duration_value?: string;
  duration_unit?: string;
  duration?: string;
  quantity: string;
  instructions: string;
  is_prn: boolean;
}

export interface ReferralSaveState {
  referred_to: string;
  specialty: string;
  institution: string;
  contact: string;
  reason: string;
  urgency: ReferralUrgency;
  clinical_summary: string;
  specific_questions: string;
}

export type ClinicalLetterDocumentType =
  | 'MEDICAL_CERTIFICATE'
  | 'WORK_ATTENDANCE'
  | 'SCHOOL_ATTENDANCE';

export interface ClinicalLetterSaveState {
  document_type: ClinicalLetterDocumentType;
  absence_start: string;
  absence_end: string;
  restrictions: string;
  include_diagnosis: boolean;
  doctor_notes: string;
  letter: string;
  approved: boolean;
}

export function emptyClinicalLetterSave(): ClinicalLetterSaveState {
  return {
    document_type: 'MEDICAL_CERTIFICATE',
    absence_start: '',
    absence_end: '',
    restrictions: '',
    include_diagnosis: false,
    doctor_notes: '',
    letter: '',
    approved: false,
  };
}

const CLINICAL_LETTER_TYPES = new Set<ClinicalLetterDocumentType>([
  'MEDICAL_CERTIFICATE',
  'WORK_ATTENDANCE',
  'SCHOOL_ATTENDANCE',
]);

export function parseClinicalLetterSave(raw: unknown): ClinicalLetterSaveState {
  const empty = emptyClinicalLetterSave();
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (!first || typeof first !== 'object') return empty;
  const row = first as Record<string, unknown>;
  const documentType = String(row.document_type ?? '');
  return {
    document_type: CLINICAL_LETTER_TYPES.has(documentType as ClinicalLetterDocumentType)
      ? (documentType as ClinicalLetterDocumentType)
      : empty.document_type,
    absence_start: String(row.absence_start ?? ''),
    absence_end: String(row.absence_end ?? ''),
    restrictions: String(row.restrictions ?? ''),
    include_diagnosis: Boolean(row.include_diagnosis),
    doctor_notes: String(row.doctor_notes ?? ''),
    letter: String(row.letter ?? ''),
    approved: Boolean(row.approved),
  };
}

export function buildClinicalLettersPayload(
  letter: ClinicalLetterSaveState
): Record<string, unknown>[] {
  const hasContent =
    letter.letter.trim().length > 0 ||
    letter.absence_start.trim().length > 0 ||
    letter.absence_end.trim().length > 0 ||
    letter.restrictions.trim().length > 0 ||
    letter.doctor_notes.trim().length > 0;
  if (!hasContent) return [];
  return [
    {
      document_type: letter.document_type,
      absence_start: letter.absence_start || null,
      absence_end: letter.absence_end || null,
      restrictions: letter.restrictions || null,
      include_diagnosis: letter.include_diagnosis,
      doctor_notes: letter.doctor_notes || null,
      letter: letter.letter,
      approved: letter.approved,
    },
  ];
}

function calcQuantity(
  durationValue: string | undefined,
  durationUnit: string | undefined,
  duration: string | undefined,
  frequency: string
): string {
  if (duration && !durationValue) {
    return '';
  }
  const dv = parseInt(durationValue ?? '', 10);
  if (!dv || !frequency) return '';
  let perDay = 1;
  if (frequency === 'BD') perDay = 2;
  else if (frequency === 'TDS') perDay = 3;
  else if (frequency === 'QID') perDay = 4;
  else if (frequency === 'Q4H') perDay = 6;
  else if (frequency === 'Q6H') perDay = 4;
  else if (frequency === 'Q8H') perDay = 3;
  else if (frequency === 'OD' || frequency === 'HS') perDay = 1;

  let days = dv;
  const unit = durationUnit ?? 'Days';
  if (unit === 'Weeks') days = dv * 7;
  else if (unit === 'Months') days = dv * 30;
  else if (unit === 'Ongoing') return '30';

  return String(Math.ceil(days * perDay));
}

export function buildReferralNestedPayload(referral: ReferralSaveState): Record<string, unknown>[] {
  const hasContent = [
    referral.referred_to,
    referral.specialty,
    referral.institution,
    referral.contact,
    referral.reason,
    referral.clinical_summary,
  ].some((value) => value.trim().length > 0);
  if (!hasContent) return [];
  return [
    {
      referred_to: referral.referred_to.trim() || 'To whom it may concern',
      specialty: referral.specialty || null,
      referred_to_institution: referral.institution || null,
      referred_to_contact: referral.contact || null,
      reason: referral.reason.trim() || 'Referral',
      urgency: referral.urgency,
      clinical_summary: referral.clinical_summary || null,
      specific_questions: referral.specific_questions || null,
      status: 'sent',
    },
  ];
}

export function buildConsultationSavePayload(params: {
  patientId: string;
  clinical: ClinicalForm;
  privateNotes: DoctorPrivateNote[];
  medications: MedicationSaveItem[];
  referral: ReferralSaveState;
  clinicalLetter?: ClinicalLetterSaveState;
  aiProvenance: AiFieldProvenanceMap;
  appointmentId?: string | null;
  recordDate?: string;
  isDraft?: boolean;
  autosave?: boolean;
  expectedUpdatedAt?: string | null;
  lettersOnly?: boolean;
}): Record<string, unknown> {
  if (params.lettersOnly) {
    return {
      referrals: buildReferralNestedPayload(params.referral),
      clinical_letters: buildClinicalLettersPayload(
        params.clinicalLetter ?? emptyClinicalLetterSave()
      ),
    };
  }

  const clinicalPayload = clinicalFormToApiPayload(params.clinical);

  const payload: Record<string, unknown> = {
    patient_id: params.patientId,
    record_date: params.recordDate ?? new Date().toISOString(),
    ...clinicalPayload,
    doctor_notes_private: params.privateNotes.length > 0 ? params.privateNotes : null,
    prescriptions: params.medications
      .filter((med) => med.drug_name)
      .map((med) => {
        const qty =
          med.quantity ||
          calcQuantity(med.duration_value, med.duration_unit, med.duration, med.frequency);
        return {
          drug_name: med.drug_name,
          generic_name: med.generic_name || null,
          brand_name: med.brand_name || null,
          strength: med.strength || null,
          dosage_form: med.dosage_form || null,
          route: med.route || null,
          dosage: med.strength || '',
          frequency: med.frequency || '',
          duration: med.duration_value
            ? `${med.duration_value} ${med.duration_unit ?? 'Days'}`
            : med.duration || null,
          quantity: qty ? parseInt(qty, 10) : null,
          instructions: med.instructions || null,
          is_prn: med.is_prn,
          status: 'active',
        };
      }),
    referrals: buildReferralNestedPayload(params.referral),
    clinical_letters: buildClinicalLettersPayload(
      params.clinicalLetter ?? emptyClinicalLetterSave()
    ),
  };

  if (params.appointmentId) {
    payload.appointment_id = params.appointmentId;
  }

  if (params.isDraft !== undefined) {
    payload.is_draft = params.isDraft;
  }

  if (params.autosave) {
    payload.autosave = true;
  }

  if (params.expectedUpdatedAt) {
    payload.expected_updated_at = params.expectedUpdatedAt;
  }

  const provenance = sanitizeAiProvenance(params.aiProvenance);
  if (provenance) {
    payload.ai_field_provenance = provenance;
  }

  return payload;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sanitizeAiProvenance(
  map: AiFieldProvenanceMap
): AiFieldProvenanceMap | undefined {
  const keys = Object.keys(map);
  if (keys.length === 0) return undefined;

  const next: AiFieldProvenanceMap = {};
  for (const key of keys) {
    const entry = map[key];
    if (!entry) continue;
    const doctorId = entry.acceptedByDoctorId?.trim();
    const { acceptedByDoctorId: _ignored, ...rest } = entry;
    next[key] =
      doctorId && UUID_RE.test(doctorId)
        ? { ...rest, acceptedByDoctorId: doctorId }
        : rest;
  }
  return next;
}
