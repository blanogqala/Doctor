import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { hostTenantOptionsFromEnv, resolveTenantSubdomainFromHostname } from './lib/hostTenant';
import { isMarketingOnlyPath, shouldClearPlatformTenantCookie } from './lib/marketing/routes';
import { decidePracticeHostRoute } from './lib/practice-host-routing';
import { PRACTICE_TENANT_HEADER } from './lib/requestPracticeTenant';

function extractSubdomain(host: string): string | null {
  return resolveTenantSubdomainFromHostname(host, hostTenantOptionsFromEnv());
}

function withPracticeCookie(
  response: NextResponse,
  subdomain: string | null,
  tenantParam: string | null
): NextResponse {
  if (subdomain) {
    response.cookies.set('practice_subdomain', subdomain, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
  } else if (tenantParam) {
    response.cookies.set('practice_subdomain', tenantParam.toLowerCase(), {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
  }
  return response;
}

function withRequestTenant(request: NextRequest, subdomain: string | null): Headers {
  const requestHeaders = new Headers(request.headers);
  if (subdomain) {
    requestHeaders.set(PRACTICE_TENANT_HEADER, subdomain);
  } else {
    requestHeaders.delete(PRACTICE_TENANT_HEADER);
  }
  return requestHeaders;
}

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const subdomain = extractSubdomain(host);
  const tenantParam = request.nextUrl.searchParams.get('tenant');
  const decision = decidePracticeHostRoute({
    host,
    pathname: request.nextUrl.pathname,
  });

  if (decision.redirectPath) {
    const url = request.nextUrl.clone();
    url.pathname = decision.redirectPath;
    url.search = '';
    return withPracticeCookie(NextResponse.redirect(url), subdomain, tenantParam);
  }

  const onPracticeHost = Boolean(subdomain || tenantParam);
  if (onPracticeHost && isMarketingOnlyPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return withPracticeCookie(NextResponse.redirect(url), subdomain, tenantParam);
  }

  const response = NextResponse.next({
    request: { headers: withRequestTenant(request, subdomain) },
  });

  if (subdomain || tenantParam) {
    return withPracticeCookie(response, subdomain, tenantParam);
  }

  if (shouldClearPlatformTenantCookie(request.nextUrl.pathname)) {
    response.cookies.delete('practice_subdomain');
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
