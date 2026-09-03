import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('doctor photo upload authorization (source contract)', () => {
  const practiceSource = fs.readFileSync(path.join(__dirname, 'practice.ts'), 'utf8');

  it('requires ADMIN or DOCTOR role for photo upload', () => {
    const photoHandler = practiceSource.match(
      /router\.post\(\s*'\/doctors\/:doctorId\/photo'[\s\S]*?photoUrl: publicUrl/
    )?.[0];
    expect(photoHandler).toBeTruthy();
    expect(photoHandler).toContain("authorize(UserRole.ADMIN, UserRole.DOCTOR)");
  });

  it('checks tenant ownership before persisting bytes', () => {
    const photoHandler = practiceSource.match(
      /router\.post\(\s*'\/doctors\/:doctorId\/photo'[\s\S]*?photoUrl: publicUrl/
    )?.[0];
    expect(photoHandler).toBeTruthy();
    expect(photoHandler).toContain('tenantWhere(req)');
    expect(photoHandler).toContain('You may only update your own public profile');
    const persistIndex = photoHandler!.indexOf('commitDoctorPhotoReplacement');
    const authzIndex = photoHandler!.indexOf('You may only update your own public profile');
    expect(authzIndex).toBeGreaterThan(-1);
    expect(persistIndex).toBeGreaterThan(authzIndex);
  });

  it('uses memory storage and magic-byte validation, not multer.diskStorage', () => {
    expect(practiceSource).not.toContain('multer.diskStorage');
    expect(practiceSource).toContain('multer.memoryStorage()');
    expect(practiceSource).toContain('detectAllowedImageMime');
    expect(practiceSource).toContain('commitDoctorPhotoReplacement');
    const photoHandler = practiceSource.match(
      /router\.post\(\s*'\/doctors\/:doctorId\/photo'[\s\S]*?photoUrl: publicUrl/
    )?.[0];
    expect(photoHandler).not.toContain('req.file.filename');
    expect(photoHandler).not.toContain('req.file.path');
  });
});
