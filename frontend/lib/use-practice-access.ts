'use client';

import { useAuth } from './auth-context';
import { mutationUnavailableHint, resolvePracticeAccess } from './practice-access';

export function usePracticeAccess() {
  const { user } = useAuth();
  const access = resolvePracticeAccess(user);
  return {
    ...access,
    user,
    isOwner: Boolean(user?.is_practice_owner),
    isPatient: user?.role === 'PATIENT',
    mutationHint: mutationUnavailableHint(user),
  };
}
