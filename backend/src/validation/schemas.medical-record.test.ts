import { describe, expect, it } from 'vitest';
import { medicalRecordUpdateSchema } from './schemas';

describe('medicalRecordUpdateSchema ai_field_provenance', () => {
  it('accepts omitted provenance', () => {
    const result = medicalRecordUpdateSchema.safeParse({
      chief_complaint: 'check-up',
      is_draft: false,
    });
    expect(result.success).toBe(true);
  });

  it('accepts null provenance (clients previously sent null for empty maps)', () => {
    const result = medicalRecordUpdateSchema.safeParse({
      chief_complaint: 'check-up',
      ai_field_provenance: null,
      is_draft: false,
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty-string acceptedByDoctorId', () => {
    const result = medicalRecordUpdateSchema.safeParse({
      ai_field_provenance: {
        assessment: { source: 'AI_ACCEPTED', acceptedByDoctorId: '' },
      },
    });
    expect(result.success).toBe(true);
  });
});
