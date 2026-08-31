import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseScribeExtractionJson } from '../services/scribeExtractionSchema';
import {
  normalizeExtraction,
  resolveScribeLlmModel,
  SCRIBE_MODELS,
} from '../services/groqScribeService';
import { mergeAiSuggestions } from '../services/aiMerge';
import { canAiWriteField } from '../services/aiProvenance';
import { REFERRAL_URGENCY_VALUES } from '../validation/schemas';

describe('scribe LLM model configuration', () => {
  it('uses openai/gpt-oss-120b by default for structured extraction', () => {
    expect(resolveScribeLlmModel()).toBe('openai/gpt-oss-120b');
    expect(SCRIBE_MODELS.llm).toBe('openai/gpt-oss-120b');
  });

  it('does not use deprecated llama-3.3-70b-versatile for extraction', () => {
    expect(resolveScribeLlmModel()).not.toBe('llama-3.3-70b-versatile');
    expect(SCRIBE_MODELS.llm).not.toBe('llama-3.3-70b-versatile');
  });

  it('clinical and referral letter drafts use the same current chat model', () => {
    const clinical = readFileSync(
      join(__dirname, '../services/clinicalLetterService.ts'),
      'utf8'
    );
    const referral = readFileSync(
      join(__dirname, '../services/referralLetterService.ts'),
      'utf8'
    );
    expect(clinical).toContain('resolveScribeLlmModel()');
    expect(referral).toContain('resolveScribeLlmModel()');
    expect(clinical).not.toContain('llama-3.3-70b-versatile');
    expect(referral).not.toContain('llama-3.3-70b-versatile');
  });

  it('keeps Whisper ASR model unchanged', () => {
    expect(SCRIBE_MODELS.asr).toBe('whisper-large-v3');
  });
});

describe('scribe extraction Zod validation', () => {
  it('accepts valid structured output', () => {
    const raw = parseScribeExtractionJson(
      JSON.stringify({
        chief_complaint: 'Sore throat',
        vital_signs: { hr: 72, temp: null },
        severity: 'MILD',
        confidence_scores: { chief_complaint: 0.8 },
        warnings: [],
      })
    );
    const { suggestions } = normalizeExtraction(raw as Record<string, unknown>);
    expect(suggestions.chief_complaint).toBe('Sore throat');
    expect(suggestions.vitals?.hr).toBe('72');
    expect(suggestions.vitals?.temp).toBeUndefined();
  });

  it('maps assessment and plan to existing SOAP fields', () => {
    const raw = parseScribeExtractionJson(
      JSON.stringify({
        assessment: 'Likely viral pharyngitis',
        plan: 'Supportive care; return if worsening',
      })
    );
    const { suggestions } = normalizeExtraction(raw as Record<string, unknown>);
    expect(suggestions.assessment).toBe('Likely viral pharyngitis');
    expect(suggestions.plan).toBe('Supportive care; return if worsening');
  });

  it('parses markdown-fenced JSON without relaxing schema', () => {
    const fenced = '```json\n{"chief_complaint":"Headache","severity":"MILD"}\n```';
    const raw = parseScribeExtractionJson(fenced);
    const { suggestions } = normalizeExtraction(raw as Record<string, unknown>);
    expect(suggestions.chief_complaint).toBe('Headache');
    expect(suggestions.severity).toBe('MILD');
  });

  it('rejects malformed JSON', () => {
    expect(() => parseScribeExtractionJson('not-json')).toThrow('INVALID_JSON');
  });

  it('rejects unknown severity enum', () => {
    expect(() =>
      parseScribeExtractionJson(
        JSON.stringify({ severity: 'CRITICAL', chief_complaint: 'x' })
      )
    ).toThrow('VALIDATION_FAILED');
  });

  it('leaves missing vitals empty rather than inventing', () => {
    const raw = parseScribeExtractionJson(
      JSON.stringify({ chief_complaint: 'Cough', vital_signs: {} })
    );
    const { suggestions } = normalizeExtraction(raw as Record<string, unknown>);
    expect(suggestions.vitals).toBeUndefined();
  });
});

describe('safe AI merge / provenance', () => {
  it('fills empty fields', () => {
    const result = mergeAiSuggestions({
      existing: { chief_complaint: '' },
      accepted: { chief_complaint: 'AI suggestion' },
      provenance: {},
    });
    expect(result.appliedKeys).toContain('chief_complaint');
    expect(result.patch.chief_complaint).toBe('AI suggestion');
  });

  it('does not overwrite doctor-authored fields', () => {
    const result = mergeAiSuggestions({
      existing: { chief_complaint: 'Doctor diagnosis text' },
      accepted: { chief_complaint: 'AI overwrite' },
      provenance: { chief_complaint: { source: 'DOCTOR' } },
    });
    expect(result.skippedKeys).toContain('chief_complaint');
    expect(result.patch.chief_complaint).toBeUndefined();
  });

  it('preserves AI_ACCEPTED_AND_EDITED', () => {
    expect(
      canAiWriteField({
        existingValue: 'edited',
        provenance: { source: 'AI_ACCEPTED_AND_EDITED' },
      })
    ).toBe(false);
  });

  it('allows refresh of AI-only suggestion', () => {
    expect(
      canAiWriteField({
        existingValue: 'old ai',
        provenance: { source: 'AI' },
      })
    ).toBe(true);
  });
});

describe('referral urgency contract', () => {
  it('exposes only ROUTINE and URGENT', () => {
    expect([...REFERRAL_URGENCY_VALUES].sort()).toEqual(['ROUTINE', 'URGENT']);
  });
});
