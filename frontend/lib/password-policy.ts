export const PASSWORD_MIN_LENGTH = 10;

export function validatePasswordClient(
  password: string
): { ok: true } | { ok: false; error: string } {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` };
  }
  if (!/[A-Za-z]/.test(password)) {
    return { ok: false, error: 'Password must include at least one letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, error: 'Password must include at least one number' };
  }
  return { ok: true };
}

export const PASSWORD_REQUIREMENTS_HINT =
  'At least 10 characters, including at least one letter and one number.';
