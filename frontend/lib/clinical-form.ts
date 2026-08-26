export const ROS_SYSTEMS = [
  'Constitutional',
  'Cardiovascular',
  'Respiratory',
  'Gastrointestinal',
  'Genitourinary',
  'Neurological',
  'Musculoskeletal',
  'Psychiatric',
  'Endocrine',
  'Dermatological',
] as const;

export const GENERAL_APPEARANCES = [
  'Well-nourished',
  'Well-developed',
  'Distressed',
  'In pain',
  'Cachectic',
  'Obese',
  'Alert and oriented',
  'Lethargic',
  'Acutely ill',
];

export interface ClinicalForm {
  chief_complaint: string;
  history_present_illness: string;
  review_of_systems: Record<string, boolean>;
  vitals: {
    bp_systolic: string;
    bp_diastolic: string;
    hr: string;
    temp: string;
    rr: string;
    spo2: string;
    weight: string;
    height: string;
  };
  general_appearance: string;
  physical_exam_notes: string;
  primary_diagnosis: string;
  icd10_codes: string;
  differential_diagnoses: string;
  severity: string;
  assessment: string;
  plan: string;
  lifestyle_advice: string;
  follow_up_date: string;
}

export function emptyClinicalForm(): ClinicalForm {
  return {
    chief_complaint: '',
    history_present_illness: '',
    review_of_systems: {},
    vitals: {
      bp_systolic: '',
      bp_diastolic: '',
      hr: '',
      temp: '',
      rr: '',
      spo2: '',
      weight: '',
      height: '',
    },
    general_appearance: '',
    physical_exam_notes: '',
    primary_diagnosis: '',
    icd10_codes: '',
    differential_diagnoses: '',
    severity: '',
    assessment: '',
    plan: '',
    lifestyle_advice: '',
    follow_up_date: '',
  };
}

export function calcBMI(weight: string, height: string): string {
  const w = parseFloat(weight);
  const h = parseFloat(height) / 100;
  if (!w || !h || h <= 0) return '';
  return (w / (h * h)).toFixed(1);
}

function numStr(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  return String(v);
}

import type { VitalSigns } from './types';

/** Build ClinicalForm from a saved MedicalRecord-like object. */
export function clinicalFormFromRecord(rec: {
  chief_complaint?: string | null;
  subjective?: string | null;
  history_present_illness?: string | null;
  review_of_systems?: Record<string, boolean> | null;
  vital_signs?: VitalSigns | null;
  general_appearance?: string | null;
  physical_examination?: Record<string, string> | null;
  objective?: string | null;
  primary_diagnosis?: string | null;
  diagnosis_codes?: string[] | null;
  differential_diagnoses?: string[] | null;
  severity?: string | null;
  assessment?: string | null;
  plan?: string | null;
  lifestyle_advice?: string | null;
  follow_up_date?: string | null;
}): ClinicalForm {
  const pe = rec.physical_examination;
  const vs = rec.vital_signs ?? {};
  return {
    chief_complaint: rec.chief_complaint || rec.subjective || '',
    history_present_illness: rec.history_present_illness || '',
    review_of_systems: { ...(rec.review_of_systems ?? {}) },
    vitals: {
      bp_systolic: numStr(vs.bp_systolic),
      bp_diastolic: numStr(vs.bp_diastolic),
      hr: numStr(vs.hr),
      temp: numStr(vs.temp),
      rr: numStr(vs.rr),
      spo2: numStr(vs.spo2),
      weight: numStr(vs.weight),
      height: numStr(vs.height),
    },
    general_appearance: rec.general_appearance || '',
    physical_exam_notes: pe?.notes || rec.objective || '',
    primary_diagnosis: rec.primary_diagnosis || '',
    icd10_codes: (rec.diagnosis_codes ?? []).join(', '),
    differential_diagnoses: (rec.differential_diagnoses ?? []).join(', '),
    severity: rec.severity || '',
    assessment: rec.assessment || '',
    plan: rec.plan || '',
    lifestyle_advice: rec.lifestyle_advice || '',
    follow_up_date: rec.follow_up_date ? rec.follow_up_date.slice(0, 10) : '',
  };
}

export function clinicalFormToApiPayload(clinical: ClinicalForm) {
  const rosObj: Record<string, boolean> = {};
  ROS_SYSTEMS.forEach((s) => {
    if (clinical.review_of_systems[s]) rosObj[s] = true;
  });

  const bmi = calcBMI(clinical.vitals.weight, clinical.vitals.height);
  const vitalsObj = {
    bp_systolic: clinical.vitals.bp_systolic ? parseInt(clinical.vitals.bp_systolic, 10) : null,
    bp_diastolic: clinical.vitals.bp_diastolic ? parseInt(clinical.vitals.bp_diastolic, 10) : null,
    hr: clinical.vitals.hr ? parseInt(clinical.vitals.hr, 10) : null,
    temp: clinical.vitals.temp ? parseFloat(clinical.vitals.temp) : null,
    rr: clinical.vitals.rr ? parseInt(clinical.vitals.rr, 10) : null,
    spo2: clinical.vitals.spo2 ? parseInt(clinical.vitals.spo2, 10) : null,
    weight: clinical.vitals.weight ? parseFloat(clinical.vitals.weight) : null,
    height: clinical.vitals.height ? parseFloat(clinical.vitals.height) : null,
    bmi: bmi ? parseFloat(bmi) : null,
  };

  const icdCodes = clinical.icd10_codes
    ? clinical.icd10_codes.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  const diffDx = clinical.differential_diagnoses
    ? clinical.differential_diagnoses.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  return {
    chief_complaint: clinical.chief_complaint || null,
    history_present_illness: clinical.history_present_illness || null,
    review_of_systems: rosObj,
    vital_signs: vitalsObj,
    general_appearance: clinical.general_appearance || null,
    physical_examination: { notes: clinical.physical_exam_notes },
    primary_diagnosis: clinical.primary_diagnosis || null,
    diagnosis_codes: icdCodes,
    differential_diagnoses: diffDx,
    severity: clinical.severity || null,
    assessment: clinical.assessment || null,
    plan: clinical.plan || null,
    lifestyle_advice: clinical.lifestyle_advice || null,
    follow_up_date: clinical.follow_up_date
      ? new Date(clinical.follow_up_date).toISOString()
      : null,
    subjective: clinical.chief_complaint || null,
    objective: clinical.physical_exam_notes || null,
  };
}

/** Compact vitals line for AI referral drafts (empty string if none filled). */
export function formatVitalsSummary(vitals: ClinicalForm['vitals']): string {
  const parts: string[] = [];
  if (vitals.bp_systolic || vitals.bp_diastolic) {
    parts.push(`BP ${vitals.bp_systolic || '?'}/${vitals.bp_diastolic || '?'}`);
  }
  if (vitals.hr) parts.push(`HR ${vitals.hr}`);
  if (vitals.temp) parts.push(`Temp ${vitals.temp}`);
  if (vitals.rr) parts.push(`RR ${vitals.rr}`);
  if (vitals.spo2) parts.push(`SpO2 ${vitals.spo2}%`);
  if (vitals.weight) parts.push(`Weight ${vitals.weight} kg`);
  if (vitals.height) parts.push(`Height ${vitals.height} cm`);
  const bmi = calcBMI(vitals.weight, vitals.height);
  if (bmi) parts.push(`BMI ${bmi}`);
  return parts.join(', ');
}

/** Positive ROS systems only, for AI referral drafts. */
export function formatPositiveRosSummary(
  reviewOfSystems: Record<string, boolean>
): string {
  const positives = ROS_SYSTEMS.filter((key) => reviewOfSystems[key]);
  return positives.join(', ');
}
