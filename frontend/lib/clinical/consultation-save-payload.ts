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

export function buildConsultationSavePayload(params: {
  patientId: string;
  clinical: ClinicalForm;
  privateNotes: DoctorPrivateNote[];
  medications: MedicationSaveItem[];
  referral: ReferralSaveState;
  aiProvenance: AiFieldProvenanceMap;
  appointmentId?: string | null;
  recordDate?: string;
  isDraft?: boolean;
  autosave?: boolean;
  expectedUpdatedAt?: string | null;
}): Record<string, unknown> {
  const clinicalPayload = clinicalFormToApiPayload(params.clinical);

  const payload: Record<string, unknown> = {
    patient_id: params.patientId,
    record_date: params.recordDate ?? new Date().toISOString(),
    ...clinicalPayload,
    doctor_notes_private: params.privateNotes.length > 0 ? params.privateNotes : null,
    ai_field_provenance:
      Object.keys(params.aiProvenance).length > 0 ? params.aiProvenance : null,
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
    referrals: params.referral.referred_to
      ? [
          {
            referred_to: params.referral.referred_to,
            specialty: params.referral.specialty || null,
            referred_to_institution: params.referral.institution || null,
            referred_to_contact: params.referral.contact || null,
            reason: params.referral.reason || 'Referral',
            urgency: params.referral.urgency,
            clinical_summary: params.referral.clinical_summary || null,
            specific_questions: params.referral.specific_questions || null,
            status: 'sent',
          },
        ]
      : [],
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

  return payload;
}
