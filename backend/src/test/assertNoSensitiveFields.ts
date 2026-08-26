import { expect } from 'vitest';

export const SENSITIVE_RESPONSE_KEYS = [
  'passwordHash',
  'password_hash',
  'failedLoginAttempts',
  'failed_login_attempts',
  'lockedUntil',
  'locked_until',
  'sessionTokenHash',
  'session_token_hash',
  'passwordResetTokenHash',
  'password_reset_token_hash',
  'invitationTokenHash',
  'invitation_token_hash',
  'activationTokenHash',
  'activation_token_hash',
] as const;

export function expectNoSensitiveFields(value: unknown, path = 'root'): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => expectNoSensitiveFields(entry, `${path}[${index}]`));
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    expect(SENSITIVE_RESPONSE_KEYS, `Sensitive key leaked at ${path}.${key}`).not.toContain(
      key as (typeof SENSITIVE_RESPONSE_KEYS)[number]
    );
    expectNoSensitiveFields(nested, `${path}.${key}`);
  }
}
