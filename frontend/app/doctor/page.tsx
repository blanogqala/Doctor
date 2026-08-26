'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { DashboardLayout } from '@/components/shared/dashboard-layout';
import { AppPage } from '@/components/layout/app-page';
import { PageHeader } from '@/components/layout/page-header';
import { MetricCard, MetricGrid } from '@/components/ds/cards';
import { StatusBadge } from '@/components/ds/status-badge';
import { ErrorState } from '@/components/ds/error-state';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { AppointmentStatusBadge, AppointmentTypeBadge } from '@/components/shared/badges';
import { DashboardSection } from '@/components/dashboard/dashboard-section';
import {
  DashboardListSkeleton,
  HeroSkeleton,
  MetricGridSkeleton,
} from '@/components/dashboard/dashboard-skeleton';
import { ScheduleRow } from '@/components/dashboard/schedule-row';
import { appointmentsApi } from '@/lib/api/appointments';
import { medicalRecordsApi } from '@/lib/api/medical-records';
import { messagesApi } from '@/lib/api/misc';
import { todayBounds } from '@/lib/appointments/day-bounds';
import {
  countByStatus,
  doctorDisplayFirstName,
  isActiveConsult,
  isCompleted,
  isRemainingToday,
  isStartable,
  isWaitingRoom,
  selectNextPatient,
  sortByScheduledAt,
  timeOfDayGreeting,
} from '@/lib/appointments/status';
import {
  continueConsultationHref,
  startConsultation,
} from '@/lib/appointments/start-consultation';
import { formatDate, formatTime } from '@/lib/format';
import { useToast } from '@/hooks/use-toast';
import type { Appointment, MedicalRecord } from '@/lib/types';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle,
  Clock,
  FileText,
  MessageSquare,
  Play,
  Stethoscope,
  Users,
} from 'lucide-react';

export default function DoctorDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [draftRecords, setDraftRecords] = useState<MedicalRecord[]>([]);
  const [recentRecords, setRecentRecords] = useState<MedicalRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [apptsError, setApptsError] = useState<string | null>(null);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    if (!user?.doctor?.id) return;
    setLoading(true);
    setApptsError(null);
    setRecordsError(null);

    const { from, to } = todayBounds();
    const doctorId = user.doctor.id;

    const [apptsResult, draftsResult, recentResult, unreadResult] = await Promise.allSettled([
      appointmentsApi.list({ doctor_id: doctorId, from, to }),
      medicalRecordsApi.list({ doctor_id: doctorId, is_draft: 'true' }),
      medicalRecordsApi.list({ doctor_id: doctorId }),
      messagesApi.unreadCount(),
    ]);

    if (apptsResult.status === 'fulfilled') {
      setAppointments([...apptsResult.value].sort(sortByScheduledAt));
    } else {
      setAppointments([]);
      setApptsError('We couldn\'t load today\'s appointments.');
    }

    if (draftsResult.status === 'fulfilled') {
      setDraftRecords(draftsResult.value.slice(0, 5));
    } else {
      setDraftRecords([]);
      setRecordsError('We couldn\'t load draft records.');
    }

    if (recentResult.status === 'fulfilled') {
      setRecentRecords(recentResult.value.slice(0, 5));
    } else if (draftsResult.status !== 'rejected') {
      setRecordsError('We couldn\'t load recent records.');
    }

    if (unreadResult.status === 'fulfilled') {
      setUnreadCount(unreadResult.value.count);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const waitingCount = countByStatus(appointments, isStartable);
  const inConsultCount = countByStatus(appointments, isActiveConsult);
  const completedCount = countByStatus(appointments, isCompleted);
  const remainingCount = countByStatus(appointments, isRemainingToday);
  const arrivedOnly = appointments.filter((a) => isWaitingRoom(a.status));

  const nextPatient = useMemo(
    () => selectNextPatient(appointments, user?.doctor?.id),
    [appointments, user?.doctor?.id]
  );

  const greeting = timeOfDayGreeting();
  const firstName = doctorDisplayFirstName(user?.profile?.full_name);
  const todayLabel = new Date().toLocaleDateString('en-ZA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const handleStart = async (appt: Appointment) => {
    if (!user?.doctor?.id) return;
    setStarting(true);
    try {
      if (isActiveConsult(appt.status)) {
        router.push(continueConsultationHref(appt));
        return;
      }
      const result = await startConsultation({
        appointment: appt,
        doctorId: user.doctor.id,
      });
      if (!result.ok) {
        toast({
          title: 'Failed to start consultation',
          description: result.error,
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: 'Consultation started',
        description: `${appt.patient?.profile?.full_name ?? 'Patient'} is now in consultation.`,
      });
      router.push(result.href);
    } finally {
      setStarting(false);
    }
  };

  return (
    <DashboardLayout>
      <AppPage>
        <PageHeader
          title={`${greeting}, Dr ${firstName}`}
          description={
            remainingCount > 0
              ? `${todayLabel} · ${remainingCount} appointment${remainingCount === 1 ? '' : 's'} remaining`
              : todayLabel
          }
        />

        {loading ? (
          <MetricGridSkeleton />
        ) : (
          <MetricGrid>
            <MetricCard
              label="Appointments today"
              value={appointments.length}
              icon={<Users className="h-5 w-5" />}
              tone="primary"
            />
            <MetricCard
              label="Waiting / due"
              value={waitingCount}
              icon={<Clock className="h-5 w-5" />}
              tone="warning"
            />
            <MetricCard
              label="In consultation"
              value={inConsultCount}
              icon={<Stethoscope className="h-5 w-5" />}
              tone="clinical"
            />
            <MetricCard
              label="Completed"
              value={completedCount}
              icon={<CheckCircle className="h-5 w-5" />}
              tone="success"
            />
          </MetricGrid>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <DashboardSection
              title={nextPatient && isActiveConsult(nextPatient.status) ? 'Current patient' : 'Next patient'}
              description="Highest priority for your clinical day"
              priority="primary"
              action={
                <Button variant="ghost" size="sm" asChild className="shrink-0">
                  <Link href="/doctor/queue">
                    Full queue <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              }
            >
              {loading ? (
                <HeroSkeleton />
              ) : apptsError ? (
                <ErrorState kind="api" message={apptsError} onRetry={() => void load()} />
              ) : !nextPatient ? (
                <EmptyState
                  icon={<CalendarDays className="h-10 w-10" />}
                  title={appointments.length === 0 ? "You're clear for today" : 'No more appointments today'}
                  description={
                    appointments.length === 0
                      ? 'No remaining appointments. View your upcoming schedule when new bookings arrive.'
                      : 'Your schedule for today is clear.'
                  }
                  action={
                    <Button asChild variant="outline">
                      <Link href="/doctor/queue">View queue</Link>
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
                        {formatTime(nextPatient.scheduled_at)}
                      </p>
                      <h3 className="text-xl font-semibold tracking-tight text-foreground break-words">
                        {nextPatient.patient?.profile?.full_name ?? 'Unknown patient'}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {nextPatient.reason?.trim() || 'No reason provided'}
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <AppointmentStatusBadge status={nextPatient.status} />
                        <AppointmentTypeBadge type={nextPatient.type} />
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(isStartable(nextPatient.status) || isActiveConsult(nextPatient.status)) && (
                      <Button
                        type="button"
                        onClick={() => void handleStart(nextPatient)}
                        disabled={starting}
                      >
                        <Play className="h-4 w-4" />
                        {isActiveConsult(nextPatient.status) ? 'Continue consultation' : 'Start consultation'}
                      </Button>
                    )}
                    <Button variant="outline" asChild>
                      <Link href={`/doctor/records?patient=${nextPatient.patient_id}`}>
                        <FileText className="h-4 w-4" />
                        Open records
                      </Link>
                    </Button>
                    <Button variant="ghost" asChild>
                      <Link href="/doctor/messages">
                        <MessageSquare className="h-4 w-4" />
                        Messages
                      </Link>
                    </Button>
                  </div>
                </div>
              )}
            </DashboardSection>

            <DashboardSection
              title="Today's schedule"
              description="Chronological view of today's appointments"
              action={
                appointments.length > 0 ? (
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/doctor/queue">
                      View all <ArrowRight className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                ) : undefined
              }
            >
              {loading ? (
                <DashboardListSkeleton rows={5} />
              ) : apptsError ? (
                <ErrorState kind="api" message={apptsError} onRetry={() => void load()} />
              ) : appointments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No appointments scheduled for today.</p>
              ) : (
                <div className="space-y-2">
                  {appointments.map((appt) => (
                    <ScheduleRow
                      key={appt.id}
                      appointment={appt}
                      primary={appt.patient?.profile?.full_name ?? 'Unknown patient'}
                      secondary={appt.reason?.trim() || undefined}
                      href={`/doctor/records?patient=${appt.patient_id}`}
                    />
                  ))}
                </div>
              )}
            </DashboardSection>
          </div>

          <div className="space-y-6">
            <DashboardSection title="Attention required" description="Unfinished work and waiting patients">
              {loading ? (
                <DashboardListSkeleton rows={3} />
              ) : (
                <ul className="space-y-3">
                  {arrivedOnly.length > 0 && (
                    <li className="rounded-xl border border-warning/30 bg-warning-soft/40 p-3">
                      <p className="text-sm font-medium text-foreground">
                        {arrivedOnly.length} patient{arrivedOnly.length === 1 ? '' : 's'} waiting
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Checked in and ready for consultation
                      </p>
                      <Button variant="link" className="mt-1 h-auto px-0" asChild>
                        <Link href="/doctor/queue">Open queue</Link>
                      </Button>
                    </li>
                  )}
                  {draftRecords.length > 0 && (
                    <li className="rounded-xl border p-3">
                      <p className="text-sm font-medium text-foreground">
                        {draftRecords.length} unfinished draft record{draftRecords.length === 1 ? '' : 's'}
                      </p>
                      <div className="mt-2 space-y-2">
                        {draftRecords.slice(0, 3).map((rec) => (
                          <Link
                            key={rec.id}
                            href={
                              rec.is_draft
                                ? `/doctor/records/${rec.patient_id}/edit/${rec.id}`
                                : `/doctor/records/${rec.patient_id}/view/${rec.id}`
                            }
                            className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm transition-colors hover:bg-muted/40"
                          >
                            <span className="min-w-0 truncate font-medium">
                              {rec.patient?.profile?.full_name ?? 'Patient'}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {formatDate(rec.record_date)}
                            </span>
                          </Link>
                        ))}
                      </div>
                      <Button variant="link" className="mt-1 h-auto px-0" asChild>
                        <Link href="/doctor/records">View records</Link>
                      </Button>
                    </li>
                  )}
                  {unreadCount > 0 && (
                    <li className="rounded-xl border p-3">
                      <p className="text-sm font-medium text-foreground">
                        {unreadCount} unread message{unreadCount === 1 ? '' : 's'}
                      </p>
                      <Button variant="link" className="mt-1 h-auto px-0" asChild>
                        <Link href="/doctor/messages">Open messages</Link>
                      </Button>
                    </li>
                  )}
                  {!arrivedOnly.length && !draftRecords.length && unreadCount === 0 && !recordsError && (
                    <EmptyState
                      icon={<CheckCircle className="h-10 w-10" />}
                      title="Nothing needs attention"
                      description="No waiting patients, draft notes, or unread messages."
                    />
                  )}
                  {recordsError && (
                    <ErrorState kind="api" message={recordsError} onRetry={() => void load()} />
                  )}
                </ul>
              )}
            </DashboardSection>

            <DashboardSection
              title="Recent patients"
              description="Latest consultation records"
              action={
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/doctor/records">
                    View all <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              }
            >
              {loading ? (
                <DashboardListSkeleton rows={4} />
              ) : recentRecords.length === 0 ? (
                <EmptyState
                  icon={<FileText className="h-10 w-10" />}
                  title="No recent records"
                  description="Completed consultations will appear here."
                />
              ) : (
                <div className="space-y-2">
                  {recentRecords.map((rec) => (
                    <Link
                      key={rec.id}
                      href={
                        rec.is_draft
                          ? `/doctor/records/${rec.patient_id}/edit/${rec.id}`
                          : `/doctor/records/${rec.patient_id}/view/${rec.id}`
                      }
                      className="dashboard-item flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors hover:border-primary/40 hover:bg-muted/40"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {rec.patient?.profile?.full_name ?? 'Patient'}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatDate(rec.record_date)}</p>
                      </div>
                      <StatusBadge
                        tone={rec.is_draft ? 'warning' : 'success'}
                        label={rec.is_draft ? 'Draft' : 'Completed'}
                      />
                    </Link>
                  ))}
                </div>
              )}
            </DashboardSection>
          </div>
        </div>
      </AppPage>
    </DashboardLayout>
  );
}
