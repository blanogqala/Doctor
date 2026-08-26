import { describe, expect, it } from 'vitest';
import { REFERRAL_URGENCY_VALUES } from '@/lib/types';
import {
  mergeAiSuggestions,
  canAiWriteField,
  markFieldsAccepted,
  markFieldEdited,
} from '@/lib/ai-merge';

describe('referral urgency contract (frontend)', () => {
  it('matches canonical ROUTINE | URGENT', () => {
    expect([...REFERRAL_URGENCY_VALUES].sort()).toEqual(['ROUTINE', 'URGENT']);
    expect(REFERRAL_URGENCY_VALUES).not.toContain('SEMI_URGENT');
    expect(REFERRAL_URGENCY_VALUES).not.toContain('EMERGENCY');
  });
});

describe('AI safe merge', () => {
  it('AI fills empty field', () => {
    const { patch, appliedKeys } = mergeAiSuggestions({
      existing: { assessment: '' },
      accepted: { assessment: 'Suggested assessment' },
      provenance: {},
    });
    expect(appliedKeys).toContain('assessment');
    expect(patch.assessment).toBe('Suggested assessment');
  });

  it('doctor field is not overwritten', () => {
    const { skippedKeys, patch } = mergeAiSuggestions({
      existing: { primary_diagnosis: 'Viral pharyngitis' },
      accepted: { primary_diagnosis: 'Something else' },
      provenance: { primary_diagnosis: { source: 'DOCTOR' } },
    });
    expect(skippedKeys).toContain('primary_diagnosis');
    expect(patch.primary_diagnosis).toBeUndefined();
  });

  it('acceptance then edit updates provenance', () => {
    let map = markFieldsAccepted({}, ['plan'], 'doctor-uuid', 'llama-test');
    expect(map.plan.source).toBe('AI_ACCEPTED');
    map = markFieldEdited(map, 'plan');
    expect(map.plan.source).toBe('AI_ACCEPTED_AND_EDITED');
    expect(canAiWriteField({ existingValue: 'x', provenance: map.plan })).toBe(false);
  });
});
