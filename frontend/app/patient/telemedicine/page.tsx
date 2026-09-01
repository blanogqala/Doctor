'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { AppointmentStatusBadge, AppointmentTypeBadge } from '@/components/shared/badges';
import { useToast } from '@/hooks/use-toast';
import { appointmentsApi } from '@/lib/api/appointments';
import { telemedicineApi } from '@/lib/api/telemedicine';
import { useTelemedicineSession } from '@/lib/telemedicine-session-context';
import { useTelemedicineJoin } from '@/hooks/useTelemedicineJoin';
import { usePollingRefresh } from '@/lib/use-polling-refresh';
import { formatDate, formatTime } from '@/lib/format';
import type { Appointment } from '@/lib/types';
import { PreCallDeviceCheck } from '@/components/telemedicine/pre-call-device-check';
import { Video, Loader2, Clock, CheckCircle2 } from 'lucide-react';

const CLOSED = new Set(['CANCELLED', 'CANCELLED_NO_SHOW', 'NO_SHOW', 'COMPLETED']);
const POLL_MS = 10_000;

export default function PatientTelemedicinePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { session, livekit } = useTelemedicineSession();
  const { joinCall, joining } = useTelemedicineJoin();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [precallForId, setPrecallForId] = useState<string | null>(null);
  const [joinBlocked, setJoinBlocked] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!user?.patient?.id) return;
    try {
      const data = await appointmentsApi.list({
        patient_id: user.patient.id,
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

  usePollingRefresh(load, POLL_MS, !!user?.patient?.id);

  const { live, upcoming, past } = useMemo(() => {
    const sorted = [...appointments].sort(
      (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
    );
    const now = Date.now();

    const liveList = sorted.filter(
      (a) =>
        !CLOSED.has(a.status) &&
        (a.status === 'IN_CONSULTATION' ||
          Boolean(a.patient_joined_at) ||
          Boolean(a.doctor_joined_at))
    );
    const upcomingList = sorted.filter(
      (a) =>
        !CLOSED.has(a.status) &&
        !a.patient_joined_at &&
        !a.doctor_joined_at &&
        a.status !== 'IN_CONSULTATION'
    );
    const pastList = sorted.filter((a) => CLOSED.has(a.status));
    void now;
    return { live: liveList, upcoming: upcomingList, past: pastList };
  }, [appointments]);

  const handleJoinWaitingRoom = async (appt: Appointment) => {
    try {
      await joinCall({
        appointmentId: appt.id,
        patientId: appt.patient_id,
        patientName: user?.profile?.full_name ?? 'You',
        doctorName: appt.doctor?.profile?.full_name ?? 'Doctor',
        reason: appt.reason,
      });
      setPrecallForId(null);
      await load();
    } catch {
      // toast in hook
    }
  };

  const startPrecheck = async (appt: Appointment) => {
    try {
      const status = await telemedicineApi.getStatus(appt.id);
      if (!status.provider_configured) {
        toast({
          title: 'Virtual consultations unavailable',
          description: 'Please try again shortly or contact the practice.',
          variant: 'destructive',
        });
        return;
      }
      if (!status.join_window.can_join) {
        setJoinBlocked((prev) => ({
          ...prev,
          [appt.id]: status.join_window.message ?? 'Join is not available yet.',
        }));
        return;
      }
      setPrecallForId(appt.id);
    } catch (err) {
      toast({
        title: 'Could not prepare join',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    }
  };

  const renderCard = (appt: Appointment, mode: 'live' | 'upcoming' | 'past') => {
    const inCall = session?.appointmentId === appt.id && Boolean(livekit);
    const doctorInCall = Boolean(appt.doctor_joined_at) || appt.status === 'IN_CONSULTATION';
    const patientCheckedIn = Boolean(appt.patient_joined_at);
    const blockedMessage = joinBlocked[appt.id];

    return (
      <Card key={appt.id}>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <Video className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">
                {formatDate(appt.scheduled_at)} at {formatTime(appt.scheduled_at)}
              </p>
              <p className="text-sm text-muted-foreground">
                {appt.doctor?.profile?.full_name ?? 'Your doctor'}
              </p>
              {appt.reason && <p className="text-sm text-muted-foreground">{appt.reason}</p>}
              {mode === 'upcoming' && !blockedMessage && (
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" /> Virtual appointment
                </p>
              )}
              {blockedMessage && (
                <p className="mt-1 text-xs text-amber-700">{blockedMessage}</p>
              )}
              {patientCheckedIn && mode === 'live' && !doctorInCall && (
                <p className="mt-1 text-xs text-emerald-700">You&apos;re checked in — waiting for doctor</p>
              )}
              {doctorInCall && mode === 'live' && (
                <p className="mt-1 text-xs text-emerald-700">Doctor has joined — you&apos;re in consultation</p>
              )}
              {mode === 'past' && appt.telemedicine_ended_at && (
                <p className="mt-1 text-xs text-muted-foreground">Session ended</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AppointmentStatusBadge status={appt.status} />
            <AppointmentTypeBadge type={appt.type} />
            {(mode === 'live' || mode === 'upcoming') && !CLOSED.has(appt.status) && (
              <>
                {precallForId === appt.id ? (
                  <div className="w-full sm:max-w-md">
                    <PreCallDeviceCheck
                      onReady={() => void handleJoinWaitingRoom(appt)}
                      onCancel={() => setPrecallForId(null)}
                    />
                  </div>
                ) : (
                  <Button
                    size="sm"
                    disabled={joining || inCall}
                    onClick={() => void startPrecheck(appt)}
                  >
                    {joining ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Video className="mr-2 h-4 w-4" />
                    )}
                    {inCall
                      ? 'In call'
                      : patientCheckedIn
                        ? 'Rejoin waiting room'
                        : 'Join waiting room'}
                  </Button>
                )}
              </>
            )}
            {mode === 'past' && (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Completed
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Telemedicine</h1>
          <p className="text-sm text-muted-foreground">
            Join your virtual consultations from here. Check your camera and microphone before entering
            the waiting room.
          </p>
        </div>

        {loading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
        ) : appointments.length === 0 ? (
          <EmptyState
            icon={<Video className="h-10 w-10" />}
            title="No telemedicine appointments"
            description="When you have a video consultation scheduled, it will appear here."
          />
        ) : (
          <>
            {live.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                  Active &amp; waiting
                </h2>
                {live.map((a) => renderCard(a, 'live'))}
              </section>
            )}
            {upcoming.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                  Upcoming
                </h2>
                {upcoming.map((a) => renderCard(a, 'upcoming'))}
              </section>
            )}
            {past.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                  Past sessions
                </h2>
                {past.map((a) => renderCard(a, 'past'))}
              </section>
            )}
          </>
        )}
      </div>
  );
}
