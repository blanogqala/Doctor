import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('Phase 7 route authZ (source contract)', () => {
  const practiceSource = fs.readFileSync(path.join(__dirname, 'practice.ts'), 'utf8');
  const practiceMgmtSource = fs.readFileSync(path.join(__dirname, 'practice-management.ts'), 'utf8');
  const authSource = fs.readFileSync(path.join(__dirname, 'auth.ts'), 'utf8');
  const authMiddleware = fs.readFileSync(path.join(__dirname, '../middleware/auth.ts'), 'utf8');
  const tenantSource = fs.readFileSync(path.join(__dirname, '../middleware/tenant.ts'), 'utf8');

  it('restricts practice branding PATCH to ADMIN only', () => {
    const brandingPatch = practiceSource.match(
      /router\.patch\(\s*'\/',[\s\S]*?authorize\(UserRole\.ADMIN\)[\s\S]*?res\.json\(toSnakeCase/
    )?.[0] ?? '';
    expect(brandingPatch).toContain('authorize(UserRole.ADMIN)');
    expect(brandingPatch).not.toContain('authorize(UserRole.ADMIN, UserRole.DOCTOR)');
  });

  it('restricts logo upload to ADMIN only', () => {
    expect(practiceSource).toMatch(/\/logo[\s\S]*?authorize\(UserRole\.ADMIN\)/);
  });

  it('requires practice owner for practice-management routes', () => {
    expect(practiceMgmtSource).toContain('requirePracticeOwner');
    expect(practiceMgmtSource).toMatch(/router\.use\([\s\S]*?requirePracticeOwner\)/);
  });

  it('exposes forgot and reset password on auth routes', () => {
    expect(authSource).toMatch(/\/forgot-password/);
    expect(authSource).toMatch(/\/reset-password/);
  });

  it('defines requirePracticeOwner helper', () => {
    expect(authMiddleware).toContain('export async function requirePracticeOwner');
    expect(authMiddleware).toContain('ownerProfileId');
  });

  it('exempts invitations and auth reset from subscription gate', () => {
    const policySource = fs.readFileSync(
      path.join(__dirname, '../services/practiceAccessPolicy.ts'),
      'utf8'
    );
    expect(tenantSource).toMatch(/invitations/);
    expect(policySource).toMatch(/activations/);
    expect(policySource).toMatch(/forgot-password/);
    expect(policySource).toMatch(/reset-password/);
    expect(policySource).toMatch(/practice-management/);
  });
});
