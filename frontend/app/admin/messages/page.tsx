'use client';

import { DashboardLayout } from '@/components/shared/dashboard-layout';
import { MessagesView } from '@/components/shared/messages-view';

export default function AdminMessagesPage() {
  return (
    <DashboardLayout>
      <MessagesView />
    </DashboardLayout>
  );
}
