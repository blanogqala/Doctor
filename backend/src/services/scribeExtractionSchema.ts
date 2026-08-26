import { z } from 'zod';

const MAX_TEXT = 20000;
const MAX_SHORT = 5000;

const rosSchema = z
  .object({
    Constitutional: z.boolean().optional(),
    Cardiovascular: z.boolean().optional(),
    Respiratory: z.boolean().optional(),
    Gastrointestinal: z.boolean().optional(),
    Genitourinary: z.boolean().optional(),
    Neurological: z.boolean().optional(),
    Musculoskeletal: z.boolean().optional(),
    Psychiatric: z.boolean().optional(),
    Endocrine: z.boolean().optional(),
    Dermatological: z.boolean().optional(),
  })
  .passthrough()
  .optional()
  .nullable();

const vitalSignsExtractionSchema = z
  .object({
    bp_systolic: z.union([z.number(), z.string(), z.null()]).optional(),
    bp_diastolic: z.union([z.number(), z.string(), z.null()]).optional(),
    hr: z.union([z.number(), z.string(), z.null()]).optional(),
    heart_rate: z.union([z.number(), z.string(), z.null()]).optional(),
    temp: z.union([z.number(), z.string(), z.null()]).optional(),
    temperature: z.union([z.number(), z.string(), z.null()]).optional(),
    rr: z.union([z.number(), z.string(), z.null()]).optional(),
    respiratory_rate: z.union([z.number(), z.string(), z.null()]).optional(),
    spo2: z.union([z.number(), z.string(), z.null()]).optional(),
    spO2: z.union([z.number(), z.string(), z.null()]).optional(),
    weight: z.union([z.number(), z.string(), z.null()]).optional(),
    height: z.union([z.number(), z.string(), z.null()]).optional(),
  })
  .passthrough()
  .optional()
  .nullable();

/**
 * Strict-ish extraction envelope. Unknown top-level keys are stripped via pick in normalize.
 * Rejects non-object / wrong severity enums / oversized strings.
 */
export const scribeExtractionSchema = z
  .object({
    chief_complaint: z.string().max(MAX_SHORT).nullable().optional(),
    history_present_illness: z.string().max(MAX_TEXT).nullable().optional(),
    review_of_systems: rosSchema,
    vital_signs: vitalSignsExtractionSchema,
    vitals: vitalSignsExtractionSchema,
    general_appearance: z.string().max(MAX_SHORT).nullable().optional(),
    physical_exam: z.string().max(MAX_TEXT).nullable().optional(),
    physical_exam_notes: z.string().max(MAX_TEXT).nullable().optional(),
    assessment: z.string().max(MAX_TEXT).nullable().optional(),
    primary_diagnosis: z.string().max(MAX_SHORT).nullable().optional(),
    icd10_codes: z.union([z.array(z.string().max(32)), z.string().max(500)]).optional().nullable(),
    differential_diagnoses: z
      .union([z.array(z.string().max(500)), z.string().max(MAX_SHORT)])
      .optional()
      .nullable(),
    severity: z
      .enum(['MILD', 'MODERATE', 'SEVERE'])
      .nullable()
      .optional()
      .or(z.literal('').transform(() => null)),
    plan: z.string().max(MAX_TEXT).nullable().optional(),
    lifestyle_advice: z.string().max(MAX_TEXT).nullable().optional(),
    follow_up: z.string().max(MAX_SHORT).nullable().optional(),
    follow_up_date: z.string().max(MAX_SHORT).nullable().optional(),
    confidence_scores: z.record(z.union([z.number(), z.string()])).optional().nullable(),
    warnings: z.array(z.string().max(1000)).optional().nullable(),
  })
  .strict();

export type ScribeExtractionRaw = z.infer<typeof scribeExtractionSchema>;

/** Strip optional markdown fences / leading commentary before JSON.parse. */
export function stripJsonPayload(content: string): string {
  let s = content.trim();
  const fenced = /^```(?:json|JSON)?\s*\r?\n?([\s\S]*?)\r?\n?```\s*$/;
  const m = s.match(fenced);
  if (m) {
    s = m[1].trim();
  } else if (s.startsWith('```')) {
    s = s
      .replace(/^```(?:json|JSON)?\s*\r?\n?/, '')
      .replace(/\r?\n?```\s*$/, '')
      .trim();
  }
  // If model added preamble, take the outermost JSON object when present.
  if (!s.startsWith('{') && !s.startsWith('[')) {
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start !== -1 && end > start) {
      s = s.slice(start, end + 1);
    }
  }
  return s;
}

export function parseScribeExtractionJson(content: string): ScribeExtractionRaw {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonPayload(content));
  } catch {
    throw new Error('INVALID_JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('INVALID_SHAPE');
  }
  // Strip unknown keys before strict parse so minor LLM extras don't fail the whole call.
  const allowed = new Set([
    'chief_complaint',
    'history_present_illness',
    'review_of_systems',
    'vital_signs',
    'vitals',
    'general_appearance',
    'physical_exam',
    'physical_exam_notes',
    'assessment',
    'primary_diagnosis',
    'icd10_codes',
    'differential_diagnoses',
    'severity',
    'plan',
    'lifestyle_advice',
    'follow_up',
    'follow_up_date',
    'confidence_scores',
    'warnings',
  ]);
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (allowed.has(k)) cleaned[k] = v;
  }
  const result = scribeExtractionSchema.safeParse(cleaned);
  if (!result.success) {
    throw new Error('VALIDATION_FAILED');
  }
  return result.data;
}
