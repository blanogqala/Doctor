/**
 * Field-level AI provenance helpers (no clinical body duplication).
 */

export type AiProvenanceSource =
  | 'AI'
  | 'DOCTOR'
  | 'AI_ACCEPTED'
  | 'AI_ACCEPTED_AND_EDITED';

export interface AiFieldProvenanceEntry {
  source: AiProvenanceSource;
  model?: string;
  generatedAt?: string;
  acceptedAt?: string;
  acceptedByDoctorId?: string;
  modifiedAfterAcceptance?: boolean;
}

export type AiFieldProvenanceMap = Record<string, AiFieldProvenanceEntry>;

export const CLINICAL_PROVENANCE_FIELDS = [
  'chief_complaint',
  'history_present_illness',
  'review_of_systems',
  'vitals',
  'general_appearance',
  'physical_exam_notes',
  'primary_diagnosis',
  'icd10_codes',
  'differential_diagnoses',
  'severity',
  'assessment',
  'plan',
  'lifestyle_advice',
  'follow_up_date',
] as const;

export type ProvenanceFieldName = (typeof CLINICAL_PROVENANCE_FIELDS)[number];

export function isDoctorProtectedSource(source?: AiProvenanceSource): boolean {
  return source === 'DOCTOR' || source === 'AI_ACCEPTED_AND_EDITED';
}

export function isEmptyClinicalValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).every((v) =>
      isEmptyClinicalValue(v)
    );
  }
  return false;
}

/**
 * Decide whether AI may write into a field given existing value + provenance.
 * Doctor-authored / edited-after-accept always win unless forceReplace.
 */
export function canAiWriteField(params: {
  existingValue: unknown;
  provenance?: AiFieldProvenanceEntry;
  forceReplace?: boolean;
}): boolean {
  if (params.forceReplace) return true;
  if (isDoctorProtectedSource(params.provenance?.source)) return false;
  if (!isEmptyClinicalValue(params.existingValue)) {
    // Non-empty without AI provenance = doctor authored
    if (!params.provenance || params.provenance.source === 'DOCTOR') return false;
    // Existing AI / AI_ACCEPTED may be refreshed
    if (
      params.provenance.source === 'AI' ||
      params.provenance.source === 'AI_ACCEPTED'
    ) {
      return true;
    }
    return false;
  }
  return true;
}

export function markAccepted(
  map: AiFieldProvenanceMap,
  field: string,
  doctorId: string,
  model?: string
): AiFieldProvenanceMap {
  const prev = map[field];
  return {
    ...map,
    [field]: {
      source: 'AI_ACCEPTED',
      model: model ?? prev?.model,
      generatedAt: prev?.generatedAt ?? new Date().toISOString(),
      acceptedAt: new Date().toISOString(),
      acceptedByDoctorId: doctorId,
      modifiedAfterAcceptance: false,
    },
  };
}

export function markEditedAfterAccept(
  map: AiFieldProvenanceMap,
  field: string
): AiFieldProvenanceMap {
  const prev = map[field];
  if (!prev) {
    return {
      ...map,
      [field]: { source: 'DOCTOR', modifiedAfterAcceptance: false },
    };
  }
  if (prev.source === 'AI' || prev.source === 'AI_ACCEPTED' || prev.source === 'AI_ACCEPTED_AND_EDITED') {
    return {
      ...map,
      [field]: {
        ...prev,
        source: 'AI_ACCEPTED_AND_EDITED',
        modifiedAfterAcceptance: true,
      },
    };
  }
  return map;
}

export function markDoctorAuthored(
  map: AiFieldProvenanceMap,
  field: string
): AiFieldProvenanceMap {
  return {
    ...map,
    [field]: { source: 'DOCTOR' },
  };
}

export function markAiSuggested(
  map: AiFieldProvenanceMap,
  fields: string[],
  model: string
): AiFieldProvenanceMap {
  const next = { ...map };
  const generatedAt = new Date().toISOString();
  for (const field of fields) {
    if (isDoctorProtectedSource(next[field]?.source)) continue;
    next[field] = {
      source: 'AI',
      model,
      generatedAt,
    };
  }
  return next;
}
