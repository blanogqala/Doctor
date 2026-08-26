import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('medical-records route authZ (source contract)', () => {
  const source = fs.readFileSync(
    path.join(__dirname, 'medical-records.ts'),
    'utf8'
  );

  it('restricts consultation audio to DOCTOR only (no ADMIN)', () => {
    expect(source).toMatch(/consultation-audio[\s\S]*?authorize\(UserRole\.DOCTOR\)/);
    expect(source).not.toMatch(
      /consultation-audio[\s\S]*?authorize\(UserRole\.DOCTOR,\s*UserRole\.ADMIN\)/
    );
  });

  it('restricts clinical mutate/amend to DOCTOR only', () => {
    expect(source).toMatch(/validateBody\(medicalRecordUpdateSchema\)/);
    expect(source).toMatch(/authorize\(UserRole\.DOCTOR\),\s*\n\s*validateBody\(medicalRecordUpdateSchema\)/);
    expect(source).toMatch(/authorize\(UserRole\.DOCTOR\),\s*\n\s*validateBody\(amendmentSchema\)/);
  });
});
