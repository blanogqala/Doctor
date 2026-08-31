import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

const REDACT_KEYS = new Set([
  // Clinical / SOAP
  'assessment',
  'plan',
  'subjective',
  'objective',
  'chief_complaint',
  'history_present_illness',
  'review_of_systems',
  'physical_examination',
  'physical_exam',
  'physical_exam_notes',
  'vital_signs',
  'vitals',
  'general_appearance',
  'primary_diagnosis',
  'differential_diagnoses',
  'diagnosis_codes',
  'icd10_codes',
  'severity',
  'lifestyle_advice',
  'follow_up_date',
  'follow_up',
  'doctor_notes_private',
  'prescriptions',
  'referrals',
  'clinical_letters',
  'correction_note',
  'transcript',
  'scribe_transcript',
  'scribeTranscript',
  'medical_history',
  'medicalHistory',
  'allergies',
  'current_medications',
  'currentMedications',
  'letter',
  'diagnosis',
  'soap',
  // Secrets / tokens
  'password',
  'password_hash',
  'passwordHash',
  'token',
  'csrf_token',
  'csrfToken',
  'activation_token',
  'activationToken',
  'invitation_token',
  'invitationToken',
  'session_token',
  'sessionToken',
  'api_key',
  'apiKey',
  'authorization',
  'Authorization',
  'rawToken',
  'raw_token',
  // Raw media
  'audio',
  'buffer',
  'scribe_audio_path',
  'scribeAudioPath',
]);

function redactValue(key: string, val: unknown): unknown {
  const lower = key.toLowerCase();
  if (
    REDACT_KEYS.has(key) ||
    REDACT_KEYS.has(lower) ||
    lower.includes('password') ||
    lower.includes('secret') ||
    lower.includes('token_hash') ||
    lower.includes('apikey') ||
    lower.includes('api_key')
  ) {
    if (Array.isArray(val)) return `[${val.length} items]`;
    if (typeof val === 'string') return '[redacted]';
    if (Buffer.isBuffer(val)) return '[redacted-buffer]';
    return '[redacted]';
  }
  return sanitizeAuditValue(val);
}

function sanitizeAuditValue(value: unknown): unknown {
  if (value == null) return value;
  if (Buffer.isBuffer(value)) return '[redacted-buffer]';
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeAuditValue(entry));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactValue(k, v);
    }
    return out;
  }
  return value;
}

/** Keep audit metadata without storing clinical PHI / secrets. */
export function redactAuditPayload(
  value: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  const sanitized = sanitizeAuditValue(value) as Record<string, unknown>;
  return {
    ...sanitized,
    _keys: Object.keys(value),
  };
}

export async function logAudit(entry: {
  practiceId?: string | null;
  actorId?: string | null;
  actorSuperAdminId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  patientId?: string | null;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  try {
    const oldValue = entry.oldValue ? redactAuditPayload(entry.oldValue) : null;
    const newValue = entry.newValue ? redactAuditPayload(entry.newValue) : null;

    await prisma.auditLog.create({
      data: {
        practiceId: entry.practiceId ?? null,
        actorId: entry.actorId ?? null,
        actorSuperAdminId: entry.actorSuperAdminId ?? null,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId ?? null,
        patientId: entry.patientId ?? null,
        oldValue: (oldValue ?? undefined) as Prisma.InputJsonValue | undefined,
        newValue: (newValue ?? undefined) as Prisma.InputJsonValue | undefined,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  } catch (err) {
    console.error('Audit log failed:', err);
  }
}
