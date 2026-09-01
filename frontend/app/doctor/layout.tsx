'use client';

import { DashboardLayout } from '@/components/shared/dashboard-layout';

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
