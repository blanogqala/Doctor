/**
 * Safe merge of AI suggestions into existing clinical form values.
 * Doctor-authored content wins unless forceReplace.
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

function isDoctorProtected(source?: AiProvenanceSource): boolean {
  return source === 'DOCTOR' || source === 'AI_ACCEPTED_AND_EDITED';
}

export function canAiWriteField(params: {
  existingValue: unknown;
  provenance?: AiFieldProvenanceEntry;
  forceReplace?: boolean;
}): boolean {
  if (params.forceReplace) return true;
  if (isDoctorProtected(params.provenance?.source)) return false;
  if (!isEmptyClinicalValue(params.existingValue)) {
    if (!params.provenance || params.provenance.source === 'DOCTOR') return false;
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

export type MergeableSuggestions = {
  chief_complaint?: string;
  history_present_illness?: string;
  review_of_systems?: Record<string, boolean>;
  vitals?: {
    bp_systolic?: string;
    bp_diastolic?: string;
    hr?: string;
    temp?: string;
    rr?: string;
    spo2?: string;
    weight?: string;
    height?: string;
    [key: string]: string | undefined;
  };
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
};

export function mergeAiSuggestions(params: {
  existing: MergeableSuggestions;
  accepted: Partial<MergeableSuggestions>;
  provenance: AiFieldProvenanceMap;
  forceReplaceKeys?: string[];
}): { patch: Partial<MergeableSuggestions>; appliedKeys: string[]; skippedKeys: string[] } {
  const force = new Set(params.forceReplaceKeys ?? []);
  const patch: Partial<MergeableSuggestions> = {};
  const appliedKeys: string[] = [];
  const skippedKeys: string[] = [];

  const tryString = (key: keyof MergeableSuggestions, value: string | undefined) => {
    if (value === undefined) return;
    const allowed = canAiWriteField({
      existingValue: params.existing[key],
      provenance: params.provenance[key as string],
      forceReplace: force.has(key as string),
    });
    if (!allowed) {
      skippedKeys.push(key as string);
      return;
    }
    (patch as Record<string, unknown>)[key as string] = value;
    appliedKeys.push(key as string);
  };

  tryString('chief_complaint', params.accepted.chief_complaint);
  tryString('history_present_illness', params.accepted.history_present_illness);
  tryString('general_appearance', params.accepted.general_appearance);
  tryString('physical_exam_notes', params.accepted.physical_exam_notes);
  tryString('primary_diagnosis', params.accepted.primary_diagnosis);
  tryString('icd10_codes', params.accepted.icd10_codes);
  tryString('differential_diagnoses', params.accepted.differential_diagnoses);
  tryString('severity', params.accepted.severity);
  tryString('assessment', params.accepted.assessment);
  tryString('plan', params.accepted.plan);
  tryString('lifestyle_advice', params.accepted.lifestyle_advice);

  if (params.accepted.follow_up_date !== undefined) {
    const raw = params.accepted.follow_up_date.trim();
    const dateMatch = raw.match(/\d{4}-\d{2}-\d{2}/);
    if (dateMatch) {
      const allowed = canAiWriteField({
        existingValue: params.existing.follow_up_date,
        provenance: params.provenance.follow_up_date,
        forceReplace: force.has('follow_up_date'),
      });
      if (allowed) {
        patch.follow_up_date = dateMatch[0];
        appliedKeys.push('follow_up_date');
      } else skippedKeys.push('follow_up_date');
    } else if (raw) {
      const allowed = canAiWriteField({
        existingValue: params.existing.plan,
        provenance: params.provenance.plan,
        forceReplace: force.has('plan'),
      });
      if (allowed) {
        const existingPlan = (params.accepted.plan ?? params.existing.plan) || '';
        patch.plan = [existingPlan, `Follow-up: ${raw}`].filter(Boolean).join('\n');
        if (!appliedKeys.includes('plan')) appliedKeys.push('plan');
      } else skippedKeys.push('follow_up_date');
    }
  }

  if (params.accepted.vitals) {
    const allowed = canAiWriteField({
      existingValue: params.existing.vitals,
      provenance: params.provenance.vitals,
      forceReplace: force.has('vitals'),
    });
    if (allowed) {
      const existing = params.existing.vitals || {};
      const merged: Record<string, string | undefined> = { ...existing };
      for (const [k, v] of Object.entries(params.accepted.vitals)) {
        if (v === undefined || v === '') continue;
        if (force.has('vitals') || isEmptyClinicalValue(existing[k])) {
          merged[k] = v;
        }
      }
      patch.vitals = merged;
      appliedKeys.push('vitals');
    } else skippedKeys.push('vitals');
  }

  if (params.accepted.review_of_systems) {
    const allowed = canAiWriteField({
      existingValue: params.existing.review_of_systems,
      provenance: params.provenance.review_of_systems,
      forceReplace: force.has('review_of_systems'),
    });
    if (allowed) {
      patch.review_of_systems = {
        ...(params.existing.review_of_systems || {}),
        ...params.accepted.review_of_systems,
      };
      appliedKeys.push('review_of_systems');
    } else skippedKeys.push('review_of_systems');
  }

  return { patch, appliedKeys, skippedKeys };
}

export function markFieldsAccepted(
  map: AiFieldProvenanceMap,
  fields: string[],
  doctorId: string,
  model?: string
): AiFieldProvenanceMap {
  const next = { ...map };
  const now = new Date().toISOString();
  for (const field of fields) {
    const prev = next[field];
    next[field] = {
      source: 'AI_ACCEPTED',
      model: model ?? prev?.model,
      generatedAt: prev?.generatedAt ?? now,
      acceptedAt: now,
      acceptedByDoctorId: doctorId,
      modifiedAfterAcceptance: false,
    };
  }
  return next;
}

export function markFieldEdited(
  map: AiFieldProvenanceMap,
  field: string
): AiFieldProvenanceMap {
  const prev = map[field];
  if (!prev) return { ...map, [field]: { source: 'DOCTOR' } };
  if (prev.source === 'AI' || prev.source === 'AI_ACCEPTED' || prev.source === 'AI_ACCEPTED_AND_EDITED') {
    return {
      ...map,
      [field]: { ...prev, source: 'AI_ACCEPTED_AND_EDITED', modifiedAfterAcceptance: true },
    };
  }
  return { ...map, [field]: { source: 'DOCTOR' } };
}

export function hasAiAssistedProvenance(map?: AiFieldProvenanceMap | null): boolean {
  if (!map) return false;
  return Object.values(map).some(
    (e) =>
      e.source === 'AI' ||
      e.source === 'AI_ACCEPTED' ||
      e.source === 'AI_ACCEPTED_AND_EDITED'
  );
}
