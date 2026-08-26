import { UserRole } from '@prisma/client';
import {
  createPlatformSession,
  createPracticeSession,
} from '../services/sessionService';
import {
  PLATFORM_SESSION_COOKIE,
  PRACTICE_SESSION_COOKIE,
} from '../utils/cookies';

export type PracticeAuth = {
  cookie: string;
  csrf: string;
  rawToken: string;
};

export type PlatformAuth = {
  cookie: string;
  csrf: string;
  rawToken: string;
};

export async function issuePracticeAuth(params: {
  profileId: string;
  practiceId: string;
  role?: UserRole;
}): Promise<PracticeAuth> {
  const { rawToken, csrfToken } = await createPracticeSession({
    profileId: params.profileId,
    practiceId: params.practiceId,
  });
  return {
    rawToken,
    csrf: csrfToken,
    cookie: `${PRACTICE_SESSION_COOKIE}=${encodeURIComponent(rawToken)}`,
  };
}

export async function issuePlatformAuth(superAdminId: string): Promise<PlatformAuth> {
  const { rawToken, csrfToken } = await createPlatformSession({ superAdminId });
  return {
    rawToken,
    csrf: csrfToken,
    cookie: `${PLATFORM_SESSION_COOKIE}=${encodeURIComponent(rawToken)}`,
  };
}

/** Cookie + CSRF headers for authenticated requests (mutations need CSRF). */
export function authHeaders(
  auth: PracticeAuth | PlatformAuth,
  extra: Record<string, string> = {}
): Record<string, string> {
  return {
    Cookie: auth.cookie,
    'X-CSRF-Token': auth.csrf,
    ...extra,
  };
}

/** Cookie only — for safe methods where CSRF is not required. */
export function cookieHeader(auth: PracticeAuth | PlatformAuth): Record<string, string> {
  return { Cookie: auth.cookie };
}
