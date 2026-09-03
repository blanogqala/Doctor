import { describe, expect, it } from 'vitest';
import { collectProductionConfigProblems } from './productionGuard';

const strongSecret = 'a'.repeat(40);

describe('collectProductionConfigProblems', () => {
  it('is empty for development', () => {
    expect(
      collectProductionConfigProblems({
        appEnv: 'development',
        jwtSecret: 'short',
        clinicalStorageDriver: 'local',
        frontendUrl: 'http://localhost:3000',
        databaseUrl: 'postgresql://u:p@localhost:5432/db',
      })
    ).toEqual([]);
  });

  it('rejects unsafe production config', () => {
    const problems = collectProductionConfigProblems({
      appEnv: 'production',
      jwtSecret: 'change-me-to-a-long-random-secret-at-least-32-chars',
      databaseUrl: 'postgresql://u:p@localhost:5432/MediNathi_test',
      frontendUrl: 'http://localhost:3000',
      clinicalStorageDriver: 'local',
      enableUatInvitationLinks: 'true',
    });
    expect(problems.length).toBeGreaterThan(3);
    expect(problems.some((p) => /JWT_SECRET/i.test(p))).toBe(true);
    expect(problems.some((p) => /DATABASE_URL/i.test(p))).toBe(true);
    expect(problems.some((p) => /FRONTEND_URL/i.test(p))).toBe(true);
    expect(problems.some((p) => /CLINICAL_STORAGE/i.test(p))).toBe(true);
    expect(problems.some((p) => /PRACTICE_MEDIA_STORAGE/i.test(p))).toBe(true);
    expect(problems.some((p) => /PUBLIC_API_URL/i.test(p))).toBe(true);
    expect(problems.some((p) => /UAT/i.test(p))).toBe(true);
  });

  it('accepts a minimal safe production config', () => {
    const problems = collectProductionConfigProblems({
      appEnv: 'production',
      jwtSecret: strongSecret,
      databaseUrl: 'postgresql://u:p@dpg-xxx-a.oregon-postgres.render.com/MediNathi',
      frontendUrl: 'https://app.MediNathi.co.za',
      clinicalStorageDriver: 'render-disk',
      practiceLogoStorageDriver: 'render-disk',
      publicApiUrl: 'https://api.medinathi.co.za',
      enableUatInvitationLinks: '',
      cookieSameSite: 'none',
      cookieSecure: 'true',
    });
    expect(problems).toEqual([]);
  });

  it('requires render-disk in staging but allows UAT links', () => {
    const problems = collectProductionConfigProblems({
      appEnv: 'staging',
      jwtSecret: strongSecret,
      databaseUrl: 'postgresql://u:p@localhost:5432/staging',
      frontendUrl: 'http://localhost:3000',
      clinicalStorageDriver: 'local',
      enableUatInvitationLinks: 'true',
    });
    expect(problems.some((p) => /CLINICAL_STORAGE/i.test(p))).toBe(true);
    expect(problems.some((p) => /PRACTICE_MEDIA_STORAGE/i.test(p))).toBe(true);
    expect(problems.some((p) => /UAT/i.test(p))).toBe(false);
  });
});
