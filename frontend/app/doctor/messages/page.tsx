'use client';

import { DashboardLayout } from '@/components/shared/dashboard-layout';
import { MessagesView } from '@/components/shared/messages-view';

export default function DoctorMessagesPage() {
  return (
    <DashboardLayout>
      <MessagesView />
    </DashboardLayout>
  );
}
