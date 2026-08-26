'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { DashboardLayout } from '@/components/shared/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { AppointmentTypeBadge } from '@/components/shared/badges';
import { useToast } from '@/hooks/use-toast';
import { appointmentsApi } from '@/lib/api/appointments';
import { checkupRecordIdFromAppointment } from '@/lib/appointment-records';
import { useTelemedicineJoin } from '@/hooks/useTelemedicineJoin';
import { usePollingRefresh } from '@/lib/use-polling-refresh';
import { formatDate, formatTime } from '@/lib/format';
import type { Appointment } from '@/lib/types';
import { PreCallDeviceCheck } from '@/components/telemedicine/pre-call-device-check';
import { Video, Loader2, Users, Clock } from 'lucide-react';

const POLL_MS = 10_000;
const CLOSED = new Set(['CANCELLED', 'CANCELLED_NO_SHOW', 'NO_SHOW', 'COMPLETED']);

export default function DoctorTelemedicinePage() {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const { joinCall, joining } = useTelemedicineJoin();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [precallForId, setPrecallForId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.doctor?.id) return;
    try {
      const data = await appointmentsApi.list({
        doctor_id: user.doctor.id,
        type: 'TELEMEDICINE',
      });
      setAppointments(data);
    } catch (err) {
      toast({
        title: 'Failed to load telemedicine appointments',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  usePollingRefresh(load, POLL_MS, !!user?.doctor?.id);

  const todayStr = new Date().toDateString();

  const { waitingNow, upcomingToday, later } = useMemo(() => {
    const sorted = [...appointments]
      .filter((a) => !CLOSED.has(a.status))
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

    const waiting = sorted.filter(
      (a) => Boolean(a.patient_joined_at) && !a.telemedicine_ended_at
    );
    const today = sorted.filter(
      (a) =>
        new Date(a.scheduled_at).toDateString() === todayStr &&
        !waiting.some((w) => w.id === a.id)
    );
    const rest = sorted.filter(
      (a) =>
        new Date(a.scheduled_at).toDateString() !== todayStr &&
        !waiting.some((w) => w.id === a.id)
    );
    return { waitingNow: waiting, upcomingToday: today, later: rest };
  }, [appointments, todayStr]);

  const handleStart = async (appt: Appointment) => {
    const recordId = checkupRecordIdFromAppointment(appt);
    try {
      await joinCall({
        appointmentId: appt.id,
        patientId: appt.patient_id,
        patientName: appt.patient?.profile?.full_name ?? 'Patient',
        reason: appt.reason,
        recordId: recordId ?? undefined,
      });
      setPrecallForId(null);
      if (recordId) {
        router.push(`/doctor/records/${appt.patient_id}/edit/${recordId}?tab=clinical`);
      } else {
        router.push('/doctor/queue');
      }
      void load();
    } catch {
      // toast in hook
    }
  };

  const renderRow = (appt: Appointment, waiting = false) => (
    <Card key={appt.id}>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">{appt.patient?.profile?.full_name ?? 'Patient'}</p>
          <p className="text-sm text-muted-foreground">
            {formatDate(appt.scheduled_at)} at {formatTime(appt.scheduled_at)}
          </p>
          {appt.reason && <p className="text-sm text-muted-foreground">{appt.reason}</p>}
          {waiting && (
            <Badge className="mt-2 border-emerald-200 bg-emerald-50 text-emerald-800">
              <Users className="mr-1 h-3 w-3" />
              Patient waiting
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AppointmentTypeBadge type={appt.type} />
          {precallForId === appt.id ? (
            <div className="w-full sm:min-w-[320px]">
              <PreCallDeviceCheck
                onReady={() => void handleStart(appt)}
                onCancel={() => setPrecallForId(null)}
              />
            </div>
          ) : (
            <Button size="sm" disabled={joining} onClick={() => setPrecallForId(appt.id)}>
              {joining ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Video className="mr-2 h-4 w-4" />
              )}
              {waiting ? 'Join waiting patient' : 'Start virtual consultation'}
            </Button>
          )}
          <Button size="sm" variant="outline" asChild>
            <Link href="/doctor/queue">Queue</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Telemedicine</h1>
          <p className="text-sm text-muted-foreground">
            Patients who have joined the waiting room appear first. Start the virtual consultation when
            you are ready.
          </p>
        </div>

        {loading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
        ) : appointments.length === 0 ? (
          <EmptyState
            icon={<Video className="h-10 w-10" />}
            title="No telemedicine appointments"
            description="Telemedicine check-ups and virtual visits will appear here."
          />
        ) : (
          <>
            {waitingNow.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                  Waiting now
                </h2>
                {waitingNow.map((a) => renderRow(a, true))}
              </section>
            )}
            {upcomingToday.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                  Upcoming today
                </h2>
                {upcomingToday.map((a) => renderRow(a))}
              </section>
            )}
            {later.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                  Later
                </h2>
                {later.map((a) => renderRow(a))}
              </section>
            )}
            {waitingNow.length === 0 && upcomingToday.length === 0 && later.length === 0 && (
              <EmptyState
                icon={<Clock className="h-10 w-10" />}
                title="No active telemedicine sessions"
                description="When a patient joins a virtual waiting room, they will appear here."
              />
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
