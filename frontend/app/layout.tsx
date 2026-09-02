import './globals.css';
import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/auth-context';
import { TenantProvider } from '@/lib/tenant';
import { TelemedicineSessionProvider } from '@/lib/telemedicine-session-context';
import { Toaster } from '@/components/ui/toaster';
import { getServerPracticeTenant } from '@/lib/serverRequestPracticeTenant';

export const metadata: Metadata = {
  metadataBase: new URL('https://MediNathi.co.za'),
  title: 'MediNathi | Modern Practice Software for Doctors',
  description:
    'Manage appointments, patient folders, clinical documentation and practice workflows in one modern workspace.',
  viewport: {
    width: 'device-width',
    initialScale: 1,
  },
};

export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const initialSubdomain = getServerPracticeTenant();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans" suppressHydrationWarning>
        <TenantProvider initialSubdomain={initialSubdomain}>
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
