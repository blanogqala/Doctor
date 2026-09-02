import { headers } from 'next/headers';
import {
  PRACTICE_TENANT_HEADER,
  hostFromRequestHeaders,
  resolvePracticeTenantForRequest,
} from './requestPracticeTenant';

/** Request-scoped practice tenant for SSR (layout → TenantProvider). */
export function getServerPracticeTenant(): string | null {
  const h = headers();
  return resolvePracticeTenantForRequest({
    host: hostFromRequestHeaders(h),
    headerValue: h.get(PRACTICE_TENANT_HEADER),
  });
}
