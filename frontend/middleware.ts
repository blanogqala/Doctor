import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  hostTenantOptionsFromEnv,
  resolveTenantSubdomainFromHostname,
} from './lib/hostTenant';

function extractSubdomain(host: string): string | null {
  return resolveTenantSubdomainFromHostname(host, hostTenantOptionsFromEnv());
}

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const subdomain = extractSubdomain(host);
  const response = NextResponse.next();

  if (subdomain) {
    response.cookies.set('practice_subdomain', subdomain, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
  } else {
    // Explicit local override: ?tenant=eastern-cape
    const tenantParam = request.nextUrl.searchParams.get('tenant');
    if (tenantParam) {
      response.cookies.set('practice_subdomain', tenantParam.toLowerCase(), {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      });
    } else {
      // Bare platform host — clear stale demo tenant cookie so marketing page shows
      response.cookies.delete('practice_subdomain');
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
