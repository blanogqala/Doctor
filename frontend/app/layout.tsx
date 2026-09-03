import './globals.css';
import type { CSSProperties, ReactNode } from 'react';
import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/auth-context';
import { TenantProvider } from '@/lib/tenant';
import { TelemedicineSessionProvider } from '@/lib/telemedicine-session-context';
import { Toaster } from '@/components/ui/toaster';
import { getServerPracticeTenant } from '@/lib/serverRequestPracticeTenant';
import { getServerPublicPracticeInfo } from '@/lib/serverPublicPracticeInfo';
import { resolveInitialHtmlThemeStyle } from '@/lib/theme/resolve-practice-theme';

export const metadata: Metadata = {
  metadataBase: new URL('https://MediNathi.co.za'),
  title: 'MediNathi | Modern Practice Software for Doctors',
  description:
    'Manage appointments, patient folders, clinical documentation and practice workflows in one modern workspace.',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
  },
};

export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: ReactNode }) {
  const initialSubdomain = getServerPracticeTenant();
  const initialPractice = await getServerPublicPracticeInfo(initialSubdomain);
  const themeStyle = resolveInitialHtmlThemeStyle({
    subdomain: initialSubdomain,
    brandingAvailable: initialPractice !== null,
    brandColor: initialPractice?.brand_color,
  });

  return (
    <html lang="en" style={themeStyle as CSSProperties | undefined} suppressHydrationWarning>
      <body className="font-sans" suppressHydrationWarning>
        <TenantProvider initialSubdomain={initialSubdomain} initialPractice={initialPractice}>
          <AuthProvider>
            <TelemedicineSessionProvider>
              {children}
              <Toaster />
            </TelemedicineSessionProvider>
          </AuthProvider>
        </TenantProvider>
      </body>
    </html>
  );
}
