import { env } from './env';
import { resolveAppEnv, type AppEnv } from './appEnv';

const PLACEHOLDER_PATTERNS = [
  /^change-?me/i,
  /your-?secret/i,
  /placeholder/i,
  /^secret$/i,
  /^test$/i,
  /^password$/i,
  /example\.com/i,
];

export type ProductionGuardInput = {
  appEnv?: AppEnv;
  nodeEnv?: string;
  jwtSecret?: string;
  databaseUrl?: string;
  frontendUrl?: string;
  platformFrontendUrl?: string | null;
  clinicalStorageDriver?: string;
  enableUatInvitationLinks?: string | undefined;
  cookieSameSite?: string | undefined;
  cookieSecure?: string | undefined;
};

function looksLikePlaceholderSecret(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 32) return true;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(trimmed));
}

function isLocalUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost');
  } catch {
    return true;
  }
}

function isLocalOrTestDatabase(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower.includes('localhost') || lower.includes('127.0.0.1')) return true;
  if (lower.includes('MediNathi_test') || lower.includes('/test')) return true;
  return false;
}

/**
 * Fail-closed checks for staging/production. Safe to call at startup.
 * Returns a list of human-readable problems (empty = OK).
 */
export function collectProductionConfigProblems(
  input: ProductionGuardInput = {}
): string[] {
  const appEnv = input.appEnv ?? resolveAppEnv();
  const problems: string[] = [];

  if (appEnv !== 'staging' && appEnv !== 'production') {
    return problems;
  }

  const jwtSecret = input.jwtSecret ?? env.JWT_SECRET;
  const databaseUrl = input.databaseUrl ?? env.DATABASE_URL;
  const frontendUrl = input.frontendUrl ?? env.FRONTEND_URL;
  const platformFrontendUrl =
    input.platformFrontendUrl === undefined
      ? env.PLATFORM_FRONTEND_URL
      : input.platformFrontendUrl;
  const clinicalStorageDriver =
    input.clinicalStorageDriver ?? env.CLINICAL_STORAGE_DRIVER;
  const uatFlag =
    input.enableUatInvitationLinks !== undefined
      ? input.enableUatInvitationLinks
      : process.env.ENABLE_UAT_INVITATION_LINKS;

  const cookieSameSite = (
    input.cookieSameSite ??
    process.env.COOKIE_SAMESITE ??
    ''
  ).toLowerCase();
  const cookieSecure = input.cookieSecure ?? process.env.COOKIE_SECURE;

  if (!databaseUrl?.trim()) {
    problems.push('DATABASE_URL is missing');
  } else if (appEnv === 'production' && isLocalOrTestDatabase(databaseUrl)) {
    problems.push('DATABASE_URL must not target localhost or a test database in production');
  }

  if (looksLikePlaceholderSecret(jwtSecret || '')) {
    problems.push('JWT_SECRET is missing, too short, or looks like a placeholder');
  }

  if (clinicalStorageDriver !== 'render-disk') {
    problems.push(
      `CLINICAL_STORAGE_DRIVER must be render-disk in ${appEnv} (got ${clinicalStorageDriver})`
    );
  }

  if (appEnv === 'production') {
    if (uatFlag === 'true' || uatFlag === '1') {
      problems.push('ENABLE_UAT_INVITATION_LINKS must not be enabled in production');
    }
    if (isLocalUrl(frontendUrl)) {
      problems.push('FRONTEND_URL must not be localhost in production');
    }
    if (platformFrontendUrl && isLocalUrl(platformFrontendUrl)) {
      problems.push('PLATFORM_FRONTEND_URL must not be localhost in production');
    }
    if (cookieSameSite === 'none' && cookieSecure === 'false') {
      problems.push('COOKIE_SAMESITE=None requires COOKIE_SECURE=true in production');
    }
  }

  return problems;
}

/**
 * Throws if staging/production config is unsafe. No-op for development/test.
 */
export function assertProductionConfigSafe(input: ProductionGuardInput = {}): void {
  const problems = collectProductionConfigProblems(input);
  if (problems.length === 0) return;
  throw new Error(
    `Unsafe ${input.appEnv ?? resolveAppEnv()} configuration:\n- ${problems.join('\n- ')}`
  );
}
