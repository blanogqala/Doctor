export const PASSWORD_MIN_LENGTH = 10;

export function validatePassword(password: string): { ok: true } | { ok: false; error: string } {
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

export function assertPassword(password: string): void {
  const result = validatePassword(password);
  if (!result.ok) {
    const err = new Error(result.error) as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }
}
