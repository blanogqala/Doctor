'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AppointmentStatusBadge, AppointmentTypeBadge } from '@/components/shared/badges';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { ViewToggle, type ViewMode } from '@/components/shared/view-toggle';
import { SlotPicker } from '@/components/shared/slot-picker';
import { AppointmentPatientPicker } from '@/components/appointments/appointment-patient-picker';
import type { DraftTelephonePatient } from '@/lib/appointments/patient-picker-ui';
import { DelayBadge } from '@/components/shared/delay-badge';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';
import { appointmentsApi } from '@/lib/api/appointments';
import { patientsApi, doctorsApi } from '@/lib/api/patients';
import { formatDate, formatTime, toDateInput } from '@/lib/format';
import { patientDisplayName } from '@/lib/patients/display-name';
import type { Appointment, Patient, Doctor, AppointmentStatus, AppointmentType } from '@/lib/types';
import { groupAppointmentsByMonthDay } from '@/lib/appointments/group-by-month-day';
import { buildAppointmentCreateBody } from '@/lib/appointments/telephone-booking';
import {
  CalendarDays,
  Plus,
  Pencil,
  Trash2,
  Filter,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  LogIn,
  Loader2,
  Video,
  Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
  arrived: number;
  completed: number;
  cancelled: number;
}

export default function AdminAppointmentsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [calView, setCalView] = useState<'calendar' | 'day'>('calendar');
  const [viewMonth, setViewMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [createOpen, setCreateOpen] = useState(false);
  const [editAppt, setEditAppt] = useState<Appointment | null>(null);
  const [cancelAppt, setCancelAppt] = useState<Appointment | null>(null);
  const [arrivedAppt, setArrivedAppt] = useState<Appointment | null>(null);
  const [saving, setSaving] = useState(false);
  const [draftPatient, setDraftPatient] = useState<DraftTelephonePatient | null>(null);

  const [form, setForm] = useState({
    patient_id: '',
    doctor_id: '',
    date: '',
    scheduled_at: '',
    duration_minutes: '30',
    type: 'IN_PERSON' as AppointmentType,
    reason: '',
  });

  const loadData = useCallback(async () => {
    const [appts, pats, docs] = await Promise.all([
      appointmentsApi.list(),
      patientsApi.list(),
      doctorsApi.list(),
    ]);
    setAppointments(appts);
    setPatients(pats);
    setDoctors(docs);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredAppointments = useMemo(() => {
    if (statusFilter === 'ALL') return appointments;
    return appointments.filter((a) => a.status === statusFilter);
  }, [appointments, statusFilter]);

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
        total: 0, pending: 0, confirmed: 0, arrived: 0, completed: 0, cancelled: 0,
      });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dateStr = date.toDateString();
      const dayAppts = appointments.filter((a) => new Date(a.scheduled_at).toDateString() === dateStr);
      days.push({
        date,
        total: dayAppts.length,
        pending: dayAppts.filter((a) => a.status === 'PENDING' || a.status === 'PENDING_IN_PERSON').length,
        confirmed: dayAppts.filter((a) => a.status === 'CONFIRMED' || a.status === 'CONFIRMED_IN_PERSON' || a.status === 'CONFIRMED_TELEMEDICINE').length,
        arrived: dayAppts.filter((a) => a.status === 'ARRIVED').length,
        completed: dayAppts.filter((a) => a.status === 'COMPLETED').length,
        cancelled: dayAppts.filter((a) => a.status === 'CANCELLED' || a.status === 'CANCELLED_NO_SHOW' || a.status === 'NO_SHOW').length,
      });
    }

    while (days.length % 7 !== 0) {
      const last = days[days.length - 1].date;
      days.push({
        date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1),
        total: 0, pending: 0, confirmed: 0, arrived: 0, completed: 0, cancelled: 0,
      });
    }

    return days;
  }, [viewMonth, appointments]);

  const dayAppointments = useMemo(() => {
    if (!selectedDate) return [];
    const dateStr = selectedDate.toDateString();
    return appointments
      .filter((a) => new Date(a.scheduled_at).toDateString() === dateStr)
      .filter((a) => statusFilter === 'ALL' || a.status === statusFilter)
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  }, [selectedDate, appointments, statusFilter]);

  const groupedAppointments = useMemo(
    () => groupAppointmentsByMonthDay(filteredAppointments),
    [filteredAppointments]
  );

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setCalView('day');
  };

  const openCreate = () => {
    setDraftPatient(null);
    setForm({
      patient_id: '',
      doctor_id: doctors[0]?.id ?? '',
      date: selectedDate ? toDateInput(selectedDate) : '',
      scheduled_at: '',
      duration_minutes: '30',
      type: 'IN_PERSON',
      reason: '',
    });
    setCreateOpen(true);
  };

  const openEdit = (appt: Appointment) => {
    setEditAppt(appt);
    setForm({
      patient_id: appt.patient_id,
      doctor_id: appt.doctor_id,
      date: toDateInput(appt.scheduled_at),
      scheduled_at: appt.scheduled_at,
      duration_minutes: String(appt.duration_minutes),
      type: appt.type,
      reason: appt.reason ?? '',
    });
  };

  const handleCreate = async () => {
    if ((!form.patient_id && !draftPatient) || !form.doctor_id || !form.scheduled_at) {
      toast({ title: 'Please fill all required fields', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = buildAppointmentCreateBody({
        doctor_id: form.doctor_id,
        scheduled_at: new Date(form.scheduled_at).toISOString(),
        duration_minutes: parseInt(form.duration_minutes, 10),
        type: form.type,
        reason: form.reason || null,
        status: form.type === 'TELEMEDICINE' ? 'CONFIRMED_TELEMEDICINE' : 'CONFIRMED_IN_PERSON',
        patient_id: form.patient_id,
        draftPatient,
      });
      const data = await appointmentsApi.create(payload);
      setSaving(false);

      await logAudit({
        action: 'CREATE',
        resource: 'appointments',
        resource_id: data.id,
        patient_id: data.patient_id,
        new_value: { scheduled_at: form.scheduled_at, type: form.type, status: data.status },
      });

      toast({ title: 'Appointment created' });
      setCreateOpen(false);
      setDraftPatient(null);
      loadData();
    } catch (err) {
      setSaving(false);
      toast({
        title: 'Failed to create appointment',
        description: err instanceof Error ? err.message : 'Create failed',
        variant: 'destructive',
      });
    }
  };

  const handleUpdate = async () => {
    if (!editAppt) return;
    setSaving(true);
    try {
      await appointmentsApi.update(editAppt.id, {
        scheduled_at: new Date(form.scheduled_at).toISOString(),
        duration_minutes: parseInt(form.duration_minutes, 10),
        type: form.type,
        reason: form.reason || null,
      });
      setSaving(false);
    } catch (err) {
      setSaving(false);
      toast({
        title: 'Failed to update',
        description: err instanceof Error ? err.message : 'Update failed',
        variant: 'destructive',
      });
      return;
    }

    await logAudit({
      action: 'UPDATE',
      resource: 'appointments',
      resource_id: editAppt.id,
      patient_id: editAppt.patient_id,
      old_value: { scheduled_at: editAppt.scheduled_at, type: editAppt.type },
      new_value: { scheduled_at: form.scheduled_at, type: form.type, reason: form.reason },
    });

    toast({ title: 'Appointment updated' });
    setEditAppt(null);
    loadData();
  };

  const handleCancel = async (reason?: string) => {
    if (!cancelAppt) return;
    try {
      await appointmentsApi.update(cancelAppt.id, {
        status: 'CANCELLED',
        cancellation_reason: reason,
      });
    } catch (err) {
      toast({
        title: 'Failed to cancel',
        description: err instanceof Error ? err.message : 'Cancel failed',
        variant: 'destructive',
      });
      return;
    }

    await logAudit({
      action: 'CANCEL',
      resource: 'appointments',
      resource_id: cancelAppt.id,
      patient_id: cancelAppt.patient_id,
      new_value: { status: 'CANCELLED', cancellation_reason: reason },
    });

    toast({ title: 'Appointment cancelled', description: 'Reason logged for audit trail' });
    setCancelAppt(null);
    loadData();
  };

  const handleMarkArrived = async () => {
    if (!arrivedAppt) return;
    try {
      await appointmentsApi.update(arrivedAppt.id, { status: 'ARRIVED' });
    } catch (err) {
      toast({
        title: 'Failed to update',
        description: err instanceof Error ? err.message : 'Update failed',
        variant: 'destructive',
      });
      return;
    }

    await logAudit({
      action: 'UPDATE',
      resource: 'appointments',
      resource_id: arrivedAppt.id,
      patient_id: arrivedAppt.patient_id,
      old_value: { status: arrivedAppt.status },
      new_value: { status: 'ARRIVED' },
    });

    toast({ title: 'Patient marked as arrived', description: `${patientDisplayName(arrivedAppt.patient) } is in the waiting room` });
    setArrivedAppt(null);
    loadData();
  };

  const isToday = (date: Date) => date.toDateString() === new Date().toDateString();
  const isCurrentMonth = (date: Date) => date.getMonth() === viewMonth.getMonth();

  const canArrive = (status: AppointmentStatus) =>
    ['PENDING', 'PENDING_IN_PERSON', 'CONFIRMED', 'CONFIRMED_IN_PERSON', 'CONFIRMED_TELEMEDICINE'].includes(status);

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Appointments</h1>
            <p className="text-sm text-muted-foreground">Calendar view and clinic management</p>
          </div>
          <div className="flex items-center gap-2">
            <ViewToggle view={viewMode} onChange={setViewMode} />
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              New Appointment
            </Button>
          </div>
        </div>

        {/* Status filter */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-[180px]">
            <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            <SelectItem value="PENDING_IN_PERSON">Pending</SelectItem>
            <SelectItem value="CONFIRMED_IN_PERSON">Confirmed (In-Person)</SelectItem>
            <SelectItem value="CONFIRMED_TELEMEDICINE">Confirmed (Telemedicine)</SelectItem>
            <SelectItem value="ARRIVED">Arrived</SelectItem>
            <SelectItem value="IN_CONSULTATION">In Consultation</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
            <SelectItem value="CANCELLED_NO_SHOW">Cancelled (No-show)</SelectItem>
            <SelectItem value="NO_SHOW">No-show</SelectItem>
          </SelectContent>
        </Select>

        {viewMode === 'calendar' ? (
          calView === 'calendar' ? (
            <Card className="animate-slide-up">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
                    </CardTitle>
                    <CardDescription>Click a day to view appointments</CardDescription>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setViewMonth(new Date())}>
                      Today
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-2 grid grid-cols-7 gap-0.5 sm:gap-1">
                  {WEEKDAYS.map((day) => (
                    <div key={day} className="min-w-0 truncate py-2 text-center text-xs font-semibold text-muted-foreground">
                      {day}
                    </div>
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
                          <span className="hidden text-[10px] text-muted-foreground sm:inline">appts</span>
                          <div className="mt-0.5 flex gap-0.5">
                            {dayInfo.pending > 0 && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                            {dayInfo.confirmed > 0 && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
                            {dayInfo.arrived > 0 && <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />}
                            {dayInfo.completed > 0 && <span className="h-1.5 w-1.5 rounded-full bg-green-500" />}
                            {dayInfo.cancelled > 0 && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
                          </div>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" />Pending</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" />Confirmed</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-cyan-500" />Arrived</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" />Completed</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />Cancelled</span>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4 animate-slide-down">
              
              <Card>
                <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
                  <Button variant="outline" onClick={() => setCalView('calendar')} className="group w-fit">
                    <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
                    Back to Calendar
                  </Button>
                  <div className="text-left sm:text-right">
                    <CardTitle className="text-lg">
                      Appointments for {selectedDate ? formatDate(selectedDate) : ''}
                    </CardTitle>
                    <CardDescription>
                      {dayAppointments.length} appointment{dayAppointments.length !== 1 ? 's' : ''}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
                  ) : dayAppointments.length === 0 ? (
                    <EmptyState
                      icon={<CalendarDays className="h-10 w-10" />}
                      title="No appointments"
                      description={`No appointments on ${selectedDate ? formatDate(selectedDate) : 'this date'}.`}
                      action={<Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Book one for this day</Button>}
                    />
                  ) : (
                    <div className="rounded-lg border divide-y">
                      {dayAppointments.map((appt) => (
                        <div
                          key={appt.id}
                          className="flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-muted/20 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex w-16 flex-shrink-0 flex-col items-center justify-center rounded-md bg-primary/5 py-1">
                              <span className="text-sm font-bold text-primary">{formatTime(appt.scheduled_at)}</span>
                              <span className="text-[10px] text-muted-foreground">{appt.duration_minutes}min</span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium text-foreground">
                                {patientDisplayName(appt.patient)}
                              </p>
                              <p className="truncate text-sm text-muted-foreground">
                                {appt.doctor?.profile?.full_name ?? '—'}
                                {appt.reason ? ` · ${appt.reason}` : ''}
                              </p>
                              <div className="mt-1">
                                <DelayBadge scheduledAt={appt.scheduled_at} delayMinutes={appt.delay_minutes} />
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
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(appt)} aria-label="Edit">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              {canArrive(appt.status) && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => setArrivedAppt(appt)}>
                                        <LogIn className="h-3 w-3" /> Arrived
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Mark patient as physically arrived</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              
                              {canArrive(appt.status) && (
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => setCancelAppt(appt)} aria-label="Cancel">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )
        ) : (
          /* ─── Table/List View — grouped by Month → Day ─── */
          <div className="space-y-4 animate-fade-in">
            {loading ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
            ) : groupedAppointments.length === 0 ? (
              <EmptyState
                icon={<CalendarDays className="h-10 w-10" />}
                title="No appointments"
                description="No appointments match the current filter."
                action={<Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />New Appointment</Button>}
              />
            ) : (
              groupedAppointments.map((month) => (
                <div key={month.monthKey} className="space-y-3">
                  <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                    <CalendarDays className="h-5 w-5 text-primary" />
                    {month.monthLabel}
                  </h2>
                  <div className="space-y-2">
                    {month.days.map((day) => (
                      <div key={day.dayKey} className="overflow-hidden rounded-xl border-2 border-primary bg-card">
                        <div className="bg-primary px-4 py-2.5 text-primary-foreground">
                          <p className="text-sm font-semibold text-primary-foreground">{day.dayLabel}</p>
                        </div>
                        <div>
                          {day.appointments.map((appt) => (
                            <div
                              key={appt.id}
                              className="flex flex-col gap-3 border-b border-primary/15 px-4 py-3 transition-colors last:border-b-0 hover:bg-primary/5 sm:flex-row sm:items-center sm:justify-between"
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
                                    {appt.doctor?.profile?.full_name ?? '—'}
                                    {appt.reason ? ` · ${appt.reason}` : ''}
                                  </p>
                                  <div className="mt-1">
                                    <DelayBadge scheduledAt={appt.scheduled_at} delayMinutes={appt.delay_minutes} />
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
                                <div className="flex items-center gap-1">
                                  {canArrive(appt.status) && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => setArrivedAppt(appt)}>
                                            <LogIn className="h-3 w-3" /> Arrived
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Mark patient as physically arrived</TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(appt)} aria-label="Edit">
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  {canArrive(appt.status) && (
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => setCancelAppt(appt)} aria-label="Cancel">
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={createOpen || !!editAppt} onOpenChange={(o) => { if (!o) { setCreateOpen(false); setEditAppt(null); setDraftPatient(null); } }}>
        <DialogContent
          className="max-w-lg"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{editAppt ? 'Edit Appointment' : 'New Appointment'}</DialogTitle>
            <DialogDescription>
              {editAppt ? 'Update appointment details' : 'Book a new appointment for a patient'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Patient *</Label>
              <AppointmentPatientPicker
                patients={patients}
                value={form.patient_id}
                draftPatient={draftPatient}
                disabled={!!editAppt}
                onChange={(v) => setForm({ ...form, patient_id: v })}
                onDraftPatient={setDraftPatient}
              />
            </div>
            <div className="space-y-2">
              <Label>Doctor *</Label>
              <Select
                value={form.doctor_id}
                onValueChange={(v) => setForm((f) => ({ ...f, doctor_id: v, scheduled_at: '' }))}
                disabled={!!editAppt}
              >
                <SelectTrigger><SelectValue placeholder="Select doctor..." /></SelectTrigger>
                <SelectContent>
                  {doctors.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.profile?.full_name} — {d.specialization}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Duration (min)</Label>
              <Select
                value={form.duration_minutes}
                onValueChange={(v) => setForm((f) => ({ ...f, duration_minutes: v, scheduled_at: '' }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="45">45 minutes</SelectItem>
                  <SelectItem value="60">60 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <SlotPicker
              doctorId={form.doctor_id}
              date={form.date}
              onDateChange={(date) => setForm((f) => ({ ...f, date, scheduled_at: '' }))}
              selectedStart={form.scheduled_at}
              onSelectStart={(scheduled_at) => setForm((f) => ({ ...f, scheduled_at }))}
              durationMinutes={parseInt(form.duration_minutes, 10) || 30}
              excludeId={editAppt?.id}
            />
            <div className="space-y-2">
              <Label>Consultation Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as AppointmentType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN_PERSON"><span className="flex items-center gap-2"><Building2 className="h-4 w-4" />In Person</span></SelectItem>
                  <SelectItem value="TELEMEDICINE"><span className="flex items-center gap-2"><Video className="h-4 w-4" />Telemedicine (Video)</span></SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Admins can assign in-person or telemedicine. Patients cannot self-select.</p>
            </div>
            <div className="space-y-2">
              <Label>Reason for Visit</Label>
              <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); setEditAppt(null); }}>Cancel</Button>
            <Button onClick={editAppt ? handleUpdate : handleCreate} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editAppt ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Arrived confirmation */}
      <ConfirmDialog
        open={!!arrivedAppt}
        onOpenChange={(o) => !o && setArrivedAppt(null)}
        title="Mark Patient as Arrived"
        description={`Confirm that ${patientDisplayName(arrivedAppt?.patient)} has arrived at the clinic? This will notify the doctor.`}
        confirmLabel="Confirm Arrival"
        onConfirm={handleMarkArrived}
      />

      {/* Cancel confirmation */}
      <ConfirmDialog
        open={!!cancelAppt}
        onOpenChange={(o) => !o && setCancelAppt(null)}
        title="Cancel Appointment"
        description={`Cancel the appointment for ${patientDisplayName(cancelAppt?.patient)}? This action will be logged in the audit trail.`}
        confirmLabel="Cancel Appointment"
        destructive
        requireReason
        reasonLabel="Cancellation Reason"
        onConfirm={handleCancel}
      />
    </>
  );
}
