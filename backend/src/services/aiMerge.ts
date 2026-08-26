/**
 * Safe merge of AI suggestions into existing clinical form values.
 * Human-authored content has priority over generated content.
 */

import {
  AiFieldProvenanceMap,
  canAiWriteField,
  isEmptyClinicalValue,
} from './aiProvenance';

export type MergeableSuggestions = {
  chief_complaint?: string;
  history_present_illness?: string;
  review_of_systems?: Record<string, boolean>;
  vitals?: Record<string, string | undefined>;
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

export type MergeableClinical = MergeableSuggestions & {
  vitals?: Record<string, string | undefined>;
  review_of_systems?: Record<string, boolean>;
};

export interface MergeAiResult {
  patch: Partial<MergeableClinical>;
  appliedKeys: string[];
  skippedKeys: string[];
}

export function mergeAiSuggestions(params: {
  existing: MergeableClinical;
  accepted: Partial<MergeableSuggestions>;
  provenance: AiFieldProvenanceMap;
  forceReplaceKeys?: string[];
}): MergeAiResult {
  const force = new Set(params.forceReplaceKeys ?? []);
  const patch: Partial<MergeableClinical> = {};
  const appliedKeys: string[] = [];
  const skippedKeys: string[] = [];

  const tryString = (
    key: keyof MergeableSuggestions,
    value: string | undefined
  ) => {
    if (value === undefined) return;
    const existingVal = params.existing[key];
    const allowed = canAiWriteField({
      existingValue: existingVal,
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
      } else {
        skippedKeys.push('follow_up_date');
      }
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
      } else {
        skippedKeys.push('follow_up_date');
      }
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
      const incoming = params.accepted.vitals;
      // Only fill empty vital subfields unless force
      const merged: Record<string, string | undefined> = { ...existing };
      for (const [k, v] of Object.entries(incoming)) {
        if (v === undefined || v === '') continue;
        if (force.has('vitals') || isEmptyClinicalValue(existing[k])) {
          merged[k] = v;
        }
      }
      patch.vitals = merged;
      appliedKeys.push('vitals');
    } else {
      skippedKeys.push('vitals');
    }
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
    } else {
      skippedKeys.push('review_of_systems');
    }
  }

  return { patch, appliedKeys, skippedKeys };
}
