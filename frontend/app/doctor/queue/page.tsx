'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AppointmentStatusBadge, AppointmentTypeBadge } from '@/components/shared/badges';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { ViewToggle, type ViewMode } from '@/components/shared/view-toggle';
import { DelayBadge } from '@/components/shared/delay-badge';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';
import { appointmentsApi } from '@/lib/api/appointments';
import { checkupRecordIdFromAppointment } from '@/lib/appointment-records';
import { useTelemedicineJoin } from '@/hooks/useTelemedicineJoin';
import { formatTime } from '@/lib/format';
import { patientDisplayName } from '@/lib/patients/display-name';
import type { Appointment, AppointmentStatus } from '@/lib/types';
import { isStartable as canStartStatus } from '@/lib/appointments/status';
import { startConsultation } from '@/lib/appointments/start-consultation';
import {
  groupAppointmentsByMonthDay,
  toDayKey,
} from '@/lib/appointments/group-by-month-day';
import {
  Users, Play, CheckCircle, XCircle, FileText, Video,
  ChevronLeft, ChevronRight, ArrowLeft, Lock, CalendarDays,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePollingRefresh } from '@/lib/use-polling-refresh';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface DayInfo {
  date: Date;
  total: number;
  pending: number;
  confirmed: number;
  inConsult: number;
  completed: number;
  noShow: number;
}

export default function DoctorQueuePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const { joinCall } = useTelemedicineJoin();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [noShowAppt, setNoShowAppt] = useState<Appointment | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [calView, setCalView] = useState<'calendar' | 'day'>('calendar');
  const [viewMonth, setViewMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const load = useCallback(async () => {
    if (!user?.doctor?.id) return;
    const data = await appointmentsApi.list({ doctor_id: user.doctor.id });
    setAppointments(data);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  usePollingRefresh(load, 5_000, !!user?.doctor?.id);

  const todayKey = toDayKey(new Date());

  const groupedAppointments = useMemo(
    () => groupAppointmentsByMonthDay(appointments),
    [appointments]
  );

  const calendarDays = useMemo((): DayInfo[] => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startWeekday = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const days: DayInfo[] = [];

    for (let i = 0; i < startWeekday; i++) {
      days.push({
        date: new Date(year, month, -startWeekday + i + 1),
        total: 0, pending: 0, confirmed: 0, inConsult: 0, completed: 0, noShow: 0,
      });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dateStr = date.toDateString();
      const dayAppts = appointments.filter((a) => new Date(a.scheduled_at).toDateString() === dateStr);
      days.push({
        date,
        total: dayAppts.length,
        pending: dayAppts.filter((a) => ['PENDING', 'PENDING_IN_PERSON', 'CONFIRMED', 'CONFIRMED_IN_PERSON', 'CONFIRMED_TELEMEDICINE', 'ARRIVED'].includes(a.status)).length,
        confirmed: dayAppts.filter((a) => ['CONFIRMED', 'CONFIRMED_IN_PERSON', 'CONFIRMED_TELEMEDICINE'].includes(a.status)).length,
        inConsult: dayAppts.filter((a) => a.status === 'IN_CONSULTATION').length,
        completed: dayAppts.filter((a) => a.status === 'COMPLETED').length,
        noShow: dayAppts.filter((a) => a.status === 'NO_SHOW' || a.status === 'CANCELLED_NO_SHOW').length,
      });
    }

    while (days.length % 7 !== 0) {
      const last = days[days.length - 1].date;
      days.push({
        date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1),
        total: 0, pending: 0, confirmed: 0, inConsult: 0, completed: 0, noShow: 0,
      });
    }

    return days;
  }, [viewMonth, appointments]);

  const dayAppointments = useMemo(() => {
    if (!selectedDate) return [];
    const dateStr = selectedDate.toDateString();
    return appointments
      .filter((a) => new Date(a.scheduled_at).toDateString() === dateStr)
      .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime());
  }, [selectedDate, appointments]);

  const handleStartConsultation = async (appt: Appointment) => {
    if (!user?.doctor?.id) return;
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
      description: `${patientDisplayName(appt.patient)} is now in consultation. Record locked to you.`,
    });

    router.push(result.href);
    void load();
  };

  const handleOpenVideo = async (appt: Appointment) => {
    if (!user?.doctor?.id) return;
    const childId = checkupRecordIdFromAppointment(appt);
    try {
      await joinCall({
        appointmentId: appt.id,
        patientId: appt.patient_id,
        patientName: patientDisplayName(appt.patient),
        reason: appt.reason,
        recordId: childId ?? undefined,
      });
      if (childId) {
        router.push(`/doctor/records/${appt.patient_id}/edit/${childId}?tab=clinical`);
      }
      void load();
    } catch {
      // toast in hook
    }
  };

  const handleComplete = async (appt: Appointment) => {
    try {
      await appointmentsApi.update(appt.id, {
        status: 'COMPLETED',
        locked_by_doctor_id: null,
      });
    } catch (err) {
      toast({
        title: 'Failed to complete',
        description: err instanceof Error ? err.message : 'Update failed',
        variant: 'destructive',
      });
      return;
    }

    await logAudit({
      action: 'UPDATE',
      resource: 'appointments',
      resource_id: appt.id,
      patient_id: appt.patient_id,
      old_value: { status: appt.status },
      new_value: { status: 'COMPLETED', locked_by_doctor_id: null },
    });

    toast({ title: 'Consultation completed' });
    load();
  };

  const handleNoShow = async (reason?: string) => {
    if (!noShowAppt) return;
    try {
      await appointmentsApi.update(noShowAppt.id, {
        status: 'NO_SHOW',
        cancellation_reason: reason,
      });
    } catch (err) {
      toast({
        title: 'Failed to mark no-show',
        description: err instanceof Error ? err.message : 'Update failed',
        variant: 'destructive',
      });
      return;
    }

    await logAudit({
      action: 'UPDATE',
      resource: 'appointments',
      resource_id: noShowAppt.id,
      patient_id: noShowAppt.patient_id,
      old_value: { status: noShowAppt.status },
      new_value: { status: 'NO_SHOW', reason },
    });

    toast({ title: 'Patient marked as no-show', description: 'Logged in audit trail' });
    setNoShowAppt(null);
    load();
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setCalView('day');
  };

  const isToday = (date: Date) => date.toDateString() === new Date().toDateString();
  const isCurrentMonth = (date: Date) => date.getMonth() === viewMonth.getMonth();

  const canStart = (status: AppointmentStatus) => canStartStatus(status);

  const dayHeaderLabel = (dayKey: string, dayLabel: string) =>
    dayKey === todayKey ? "Today's Queue" : dayLabel;

  const renderAppointmentRow = (appt: Appointment) => {
    const isActive = appt.status === 'IN_CONSULTATION';
    return (
      <div
        key={appt.id}
        className={cn(
          'flex flex-col gap-3 border-b border-primary/15 px-4 py-3 transition-colors last:border-b-0 hover:bg-primary/5 sm:flex-row sm:items-center sm:justify-between',
          isActive && 'bg-teal-50/80',
          appt.status === 'NO_SHOW' && 'bg-gray-50 opacity-75'
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex w-16 flex-shrink-0 flex-col items-center justify-center rounded-md bg-primary/10 py-1">
            <span className="text-sm font-bold text-primary">{formatTime(appt.scheduled_at)}</span>
            <span className="text-[10px] text-muted-foreground">{appt.duration_minutes}min</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-foreground">
              {patientDisplayName(appt.patient)}
            </p>
            <p className="truncate text-sm text-muted-foreground">
              {appt.reason ?? '—'}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <DelayBadge scheduledAt={appt.scheduled_at} delayMinutes={appt.delay_minutes} />
              {isActive && (
                <span className="flex items-center gap-1 rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-700">
                  <Lock className="h-3 w-3" /> Locked
                </span>
              )}
              {isActive && appt.patient_joined_at && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  Patient joined
                </span>
              )}
              {isActive && appt.type === 'TELEMEDICINE' && !appt.patient_joined_at && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  Waiting for patient
                </span>
              )}
            </div>
            {(appt.status === 'CANCELLED_NO_SHOW' || appt.status === 'NO_SHOW' || appt.status === 'CANCELLED') &&
              appt.cancellation_reason && (
                <p className="mt-0.5 truncate text-xs text-red-600">
                  {appt.cancellation_reason}
                </p>
              )}
          </div>
        </div>
        <div className="flex flex-shrink-0 flex-col items-start gap-2 sm:items-end">
          <div className="flex flex-wrap items-center gap-1.5">
            <AppointmentStatusBadge status={appt.status} />
            <AppointmentTypeBadge type={appt.type} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {canStart(appt.status) && (
              <Button size="sm" variant="default" onClick={() => handleStartConsultation(appt)}>
                <Play className="mr-1 h-3 w-3" /> Start Consultation
              </Button>
            )}
            {appt.status === 'IN_CONSULTATION' && (
              <>
                <Button size="sm" variant="default" onClick={() => handleComplete(appt)}>
                  <CheckCircle className="mr-1 h-3 w-3" /> Complete
                </Button>
                {appt.type === 'TELEMEDICINE' && (
                  <Button size="sm" variant="outline" onClick={() => void handleOpenVideo(appt)}>
                    <Video className="mr-1 h-3 w-3" /> Video
                  </Button>
                )}
              </>
            )}
            {appt.status === 'COMPLETED' && (
              <Button size="sm" variant="outline" asChild>
                <Link href={`/doctor/records?patient=${appt.patient_id}`}>
                  <FileText className="mr-1 h-3 w-3" /> Records
                </Link>
              </Button>
            )}
            {canStart(appt.status) && (
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setNoShowAppt(appt)}>
                <XCircle className="mr-1 h-3 w-3" /> No-show
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderDayContainer = (
    dayKey: string,
    dayLabel: string,
    dayAppts: Appointment[]
  ) => (
    <div key={dayKey} className="overflow-hidden rounded-xl border-2 border-primary bg-card">
      <div className="bg-primary px-4 py-2.5 text-primary-foreground">
        <p className="text-sm font-semibold text-primary-foreground">
          {dayHeaderLabel(dayKey, dayLabel)}
        </p>
      </div>
      <div>{dayAppts.map((appt) => renderAppointmentRow(appt))}</div>
    </div>
  );

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Patient Queue</h1>
            <p className="text-sm text-muted-foreground">Manage today&apos;s consultations</p>
          </div>
          <ViewToggle view={viewMode} onChange={setViewMode} />
        </div>

        {viewMode === 'calendar' ? (
          calView === 'calendar' ? (
            <Card className="animate-slide-up">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
                    </CardTitle>
                    <CardDescription>Click a day to view your queue</CardDescription>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setViewMonth(new Date())}>Today</Button>
                    <Button variant="outline" size="icon" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-2 grid grid-cols-7 gap-0.5 sm:gap-1">
                  {WEEKDAYS.map((day) => (
                    <div key={day} className="min-w-0 truncate py-2 text-center text-xs font-semibold text-muted-foreground">{day}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
                  {calendarDays.map((dayInfo, i) => (
                    <button
                      key={i}
                      onClick={() => handleDateSelect(dayInfo.date)}
                      className={cn(
                        'relative flex min-h-[56px] min-w-0 flex-col items-center overflow-hidden rounded-lg border p-1 text-center transition-all duration-200 hover:scale-[1.02] hover:shadow-md sm:min-h-[80px] sm:p-2',
                        isCurrentMonth(dayInfo.date) ? 'bg-card' : 'bg-muted/30',
                        isToday(dayInfo.date) ? 'border-primary ring-1 ring-primary/30' : 'border-border hover:border-primary/40'
                      )}
                    >
                      <span className={cn(
                        'text-sm font-medium',
                        isToday(dayInfo.date) && 'flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground',
                        !isCurrentMonth(dayInfo.date) && 'text-muted-foreground/50',
                        isCurrentMonth(dayInfo.date) && !isToday(dayInfo.date) && 'text-foreground'
                      )}>
                        {dayInfo.date.getDate()}
                      </span>
                      {dayInfo.total > 0 && (
                        <div className="mt-1 flex flex-1 flex-col items-center justify-center gap-0.5">
                          <span className="text-sm font-bold text-foreground">{dayInfo.total}</span>
                          <div className="mt-0.5 flex gap-0.5">
                            {dayInfo.pending > 0 && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                            {dayInfo.inConsult > 0 && <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />}
                            {dayInfo.completed > 0 && <span className="h-1.5 w-1.5 rounded-full bg-green-500" />}
                            {dayInfo.noShow > 0 && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
                          </div>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" />Waiting</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-teal-500" />In Consultation</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" />Completed</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />No-show</span>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4 animate-slide-down">
              <Button variant="outline" onClick={() => setCalView('calendar')} className="group">
                <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
                Back to Calendar
              </Button>
              {loading ? (
                <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
              ) : dayAppointments.length === 0 ? (
                <EmptyState icon={<Users className="h-10 w-10" />} title="No patients" description="No appointments on this day." />
              ) : selectedDate ? (
                renderDayContainer(
                  toDayKey(selectedDate),
                  `${selectedDate.getDate()} ${MONTHS[selectedDate.getMonth()].slice(0, 3)}`,
                  dayAppointments
                )
              ) : null}
            </div>
          )
        ) : (
          /* List view — month → day containers (reception-style) */
          <div className="space-y-4 animate-fade-in">
            {loading ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
            ) : groupedAppointments.length === 0 ? (
              <EmptyState
                icon={<CalendarDays className="h-10 w-10" />}
                title="No appointments"
                description="You have no appointments in your queue."
              />
            ) : (
              groupedAppointments.map((month) => (
                <div key={month.monthKey} className="space-y-3">
                  <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                    <CalendarDays className="h-5 w-5 text-primary" />
                    {month.monthLabel}
                  </h2>
                  <div className="space-y-2">
                    {month.days.map((day) =>
                      renderDayContainer(day.dayKey, day.dayLabel, day.appointments)
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!noShowAppt}
        onOpenChange={(o) => !o && setNoShowAppt(null)}
        title="Mark as No-show"
        description={`Mark ${patientDisplayName(noShowAppt?.patient)} as a no-show? This will be logged in the audit trail.`}
        confirmLabel="Mark No-show"
        destructive
        requireReason
        reasonLabel="Reason (e.g. Patient did not arrive, Patient cancelled)"
        onConfirm={handleNoShow}
      />
    </>
  );
}
