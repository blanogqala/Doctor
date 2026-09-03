import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { REFERRAL_URGENCY_VALUES } from '../validation/schemas';

/**
 * Prevent Phase 4 enum drift from recurring: frontend types and Prisma/backend
 * must stay locked to ROUTINE | URGENT.
 */
describe('referral urgency FE/BE contract', () => {
  it('backend allowed values are ROUTINE and URGENT only', () => {
    expect(REFERRAL_URGENCY_VALUES).toEqual(['ROUTINE', 'URGENT']);
  });

  it('Prisma schema enum matches', () => {
    const schema = readFileSync(
      join(__dirname, '../../prisma/schema.prisma'),
      'utf8'
    );
    const match = schema.match(/enum ReferralUrgency \{([^}]+)\}/);
    expect(match).toBeTruthy();
    const body = match![1];
    expect(body).toContain('ROUTINE');
    expect(body).toContain('URGENT');
    expect(body).not.toContain('SEMI_URGENT');
    expect(body).not.toContain('EMERGENCY');
  });

  it('AI routes require patient binding for referral draft', () => {
    const ai = readFileSync(join(__dirname, '../controllers/aiController.ts'), 'utf8');
    expect(ai).toMatch(/patientId is required/);
    expect(ai).toMatch(/assertClinicalPatientAccess/);
    expect(ai).toMatch(/clinicalLetterDraft/);
  });

  it('scribe requires recording consent', () => {
    const ai = readFileSync(join(__dirname, '../controllers/aiController.ts'), 'utf8');
    expect(ai).toMatch(/Recording consent is required/);
    expect(ai).toMatch(/requireValidRecordingConsent/);
  });
});
