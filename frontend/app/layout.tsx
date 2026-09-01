import './globals.css';
import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/auth-context';
import { TenantProvider } from '@/lib/tenant';
import { TelemedicineSessionProvider } from '@/lib/telemedicine-session-context';
import { Toaster } from '@/components/ui/toaster';

export const metadata: Metadata = {
  metadataBase: new URL('https://medspace.co.za'),
  title: 'MedSpace | Modern Practice Software for Doctors',
  description:
    'Manage appointments, patient folders, clinical documentation and practice workflows in one modern workspace.',
  viewport: {
    width: 'device-width',
    initialScale: 1,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans" suppressHydrationWarning>
        <TenantProvider>
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
