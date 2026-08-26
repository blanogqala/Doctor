import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Source-contract: UAT invitation URL must only be attached behind the dual gate helper.
 */
describe('UAT invitation links — Super Admin routes contract', () => {
  const routesPath = path.join(__dirname, 'super-admin.ts');
  const source = fs.readFileSync(routesPath, 'utf8');

  it('uses buildUatInvitationUrlIfEnabled for create and resend responses', () => {
    expect(source).toContain("from '../config/uatInvitationLinks'");
    expect(source).toContain('buildUatInvitationUrlIfEnabled');
    expect(source).toMatch(/uatInvitationUrl/);
  });

  it('does not unconditionally return raw invitation tokens', () => {
    expect(source).not.toMatch(/token:\s*token\b/);
    expect(source).not.toMatch(/owner_invitation_token/);
    expect(source).toContain('...(uatInvitationUrl ? { uatInvitationUrl } : {})');
  });
});
