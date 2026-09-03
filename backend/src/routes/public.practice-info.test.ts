import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('public practice-info logo delivery (source contract)', () => {
  const source = fs.readFileSync(path.join(__dirname, 'public.ts'), 'utf8');
  const practiceSource = fs.readFileSync(path.join(__dirname, 'practice.ts'), 'utf8');

  it('resolves an absolute public logo URL on practice-info', () => {
    expect(source).toContain('resolvePublicPracticeLogoUrl');
    expect(source).toContain('publicApiOriginFromRequest');
    expect(source).toMatch(/logoUrl,/);
  });

  it('serves durable logos from a public practice-scoped path', () => {
    expect(source).toContain('/practice-logos/:practiceId/:filename');
    expect(source).toContain('isLogoKeyOwnedByPractice');
  });

  it('does not expose staff/patient/clinical secrets on practice-info', () => {
    expect(source).not.toMatch(/passwordHash/);
    expect(source).not.toMatch(/patients:/);
    expect(source).not.toMatch(/sessionToken/);
    expect(source).not.toMatch(/medicalRecord/);
  });

  it('uploads logos via memory storage into PracticeLogoStorage, not multer.diskStorage', () => {
    expect(practiceSource).toContain('multer.memoryStorage()');
    expect(practiceSource).toContain('persistPracticeLogo');
    expect(practiceSource).toContain('authorize(UserRole.ADMIN)');
    const logoHandler = practiceSource.match(
      /router\.post\(\s*'\/logo'[\s\S]*?res\.json\(toSnakeCase/
    )?.[0];
    expect(logoHandler).toBeTruthy();
    expect(logoHandler).not.toContain('multer.diskStorage');
    expect(logoHandler).not.toContain('req.file.filename');
  });
});
