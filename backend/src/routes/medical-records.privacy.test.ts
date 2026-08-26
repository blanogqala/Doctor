import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('medical-records clinical privacy & immutability (source contract)', () => {
  const route = fs.readFileSync(path.join(__dirname, 'medical-records.ts'), 'utf8');
  const controller = fs.readFileSync(
    path.join(__dirname, '../controllers/medicalRecordController.ts'),
    'utf8'
  );

  it('does not expose standalone prescription/referral/amendment IDOR routes', () => {
    expect(fs.existsSync(path.join(__dirname, 'prescriptions.ts'))).toBe(false);
    expect(fs.existsSync(path.join(__dirname, 'referrals.ts'))).toBe(false);
    expect(route).toMatch(/\/:id\/amendments/);
    expect(route).not.toMatch(/router\.(get|patch|delete)\(['\"]\/prescriptions/);
  });

  it('restricts clinical mutate/amend to DOCTOR only', () => {
    expect(route).toMatch(
      /authorize\(UserRole\.DOCTOR\),\s*\n\s*validateBody\(medicalRecordUpdateSchema\)/
    );
    expect(route).toMatch(/authorize\(UserRole\.DOCTOR\),\s*\n\s*validateBody\(amendmentSchema\)/);
  });

  it('redacts clinical fields for ADMIN/reception metadata responses', () => {
    expect(controller).toMatch(/function toAdminRecordMetadata/);
    expect(controller).toMatch(/subjective:\s*null/);
    expect(controller).toMatch(/doctorNotesPrivate:\s*null/);
    expect(controller).toMatch(/hasScribeRecording:\s*false/);
    expect(controller).toMatch(/role === UserRole\.ADMIN[\s\S]*toAdminRecordMetadata/);
  });

  it('strips doctor-private notes and scribe fields for patients', () => {
    expect(controller).toMatch(/function toPatientRecordResponse/);
    expect(controller).toMatch(/doctorNotesPrivate:\s*_/);
    expect(controller).toMatch(/function stripScribeFieldsForPatient/);
    expect(controller).toMatch(/scribeTranscript:\s*_t/);
    expect(controller).toMatch(/scribeConfidence:\s*_c/);
    expect(controller).toMatch(/aiFieldProvenance:\s*_a/);
    expect(controller).toMatch(/scribeStatus:\s*_s/);
  });

  it('redacts AI provenance from ADMIN metadata', () => {
    expect(controller).toMatch(/aiFieldProvenance:\s*null/);
    expect(controller).toMatch(/scribeStatus:\s*null/);
  });

  it('blocks AI recording attach on finalized records', () => {
    expect(controller).toMatch(/Cannot attach AI recordings to a finalized medical record/);
  });

  it('enforces finalized record immutability with 409', () => {
    expect(controller).toMatch(/Finalized records are immutable/);
    expect(controller).toMatch(/!existing\.isDraft && !existing\.isErroneous/);
    expect(controller).toMatch(/409/);
  });

  it('scopes medical-record queries by practiceId', () => {
    expect(controller).toMatch(/softDeletedAt:\s*null,\s*practiceId/);
    expect(controller).toMatch(/id:\s*req\.params\.id,\s*practiceId/);
  });

  it('hides draft parent visits from patients on getById', () => {
    expect(controller).toMatch(/record\.isDraft && !record\.parentRecordId/);
  });
});
