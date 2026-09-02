'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TableSection } from '@/components/ds/table-section';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AppointmentStatusBadge, AppointmentTypeBadge } from '@/components/shared/badges';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { SlotPicker } from '@/components/shared/slot-picker';
import { DelayBadge } from '@/components/shared/delay-badge';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';
import { appointmentsApi } from '@/lib/api/appointments';
import { doctorsApi } from '@/lib/api/patients';
import { formatDate, formatTime, toDateInput } from '@/lib/format';
import type { Appointment, Doctor } from '@/lib/types';
import {
  CalendarDays,
  Plus,
  Trash2,
  Building2,
  Loader2,
  X,
  CheckCircle2,
  MessageSquare,
  Video,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { usePollingRefresh } from '@/lib/use-polling-refresh';
import { useTelemedicineSession } from '@/lib/telemedicine-session-context';
import { useTelemedicineJoin } from '@/hooks/useTelemedicineJoin';

const CLOSED_STATUSES = ['CANCELLED', 'CANCELLED_NO_SHOW', 'COMPLETED', 'NO_SHOW'];
const APPT_POLL_MS = 5_000;

function needsTelemedicineConfirm(appt: Appointment) {
  const decision = appt.patient_telemedicine_decision;
  return (
    appt.type === 'TELEMEDICINE' &&
    decision !== 'ACCEPTED_VIDEO' &&
    decision !== 'SWITCHED_IN_PERSON' &&
    !CLOSED_STATUSES.includes(appt.status)
  );
}

function canJoinTelemedicine(appt: Appointment) {
  return (
    appt.type === 'TELEMEDICINE' &&
    !CLOSED_STATUSES.includes(appt.status)
  );
}

export default function PatientBookPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const { session, livekit } = useTelemedicineSession();
  const { joinCall } = useTelemedicineJoin();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editAppt, setEditAppt] = useState<Appointment | null>(null);
  const [cancelAppt, setCancelAppt] = useState<Appointment | null>(null);
  const [saving, setSaving] = useState(false);
  const [receivedAppt, setReceivedAppt] = useState<Appointment | null>(null);

  const [form, setForm] = useState({
    doctor_id: '',
    date: '',
    scheduled_at: '',
    reason: '',
  });

  const load = useCallback(async () => {
    if (!user?.patient?.id) return;
    try {
      const [appts, docs] = await Promise.all([
        appointmentsApi.list({ patient_id: user.patient.id }),
        doctorsApi.list(),
      ]);
      setAppointments(appts);
      setDoctors(docs);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  usePollingRefresh(load, APPT_POLL_MS, !!user?.patient?.id);
  const openCreate = () => {
    setForm({
      doctor_id: user?.patient?.assigned_doctor_id ?? doctors[0]?.id ?? '',
      date: '',
      scheduled_at: '',
      reason: '',
    });
    setCreateOpen(true);
  };

  const openEdit = (appt: Appointment) => {
    setEditAppt(appt);
    setForm({
      doctor_id: appt.doctor_id,
      date: toDateInput(appt.scheduled_at),
      scheduled_at: appt.scheduled_at,
      reason: appt.reason ?? '',
    });
  };

  const handleCreate = async () => {
    if (!form.doctor_id || !form.scheduled_at || !user?.patient?.id) {
      toast({ title: 'Please select a doctor, date, and available time', variant: 'destructive' });
      return;
    }

    const scheduledDate = new Date(form.scheduled_at);
    if (scheduledDate < new Date()) {
      toast({ title: 'Cannot book in the past', description: 'Please select a future date and time.', variant: 'destructive' });
      return;
    }

    setSaving(true);

    try {
      const data = await appointmentsApi.create({
        patient_id: user.patient.id,
        doctor_id: form.doctor_id,
        scheduled_at: scheduledDate.toISOString(),
        type: 'IN_PERSON',
        reason: form.reason || null,
        status: 'PENDING_IN_PERSON',
      });
      setSaving(false);

      await logAudit({
        action: 'CREATE',
        resource: 'appointments',
        resource_id: data.id,
        patient_id: user.patient.id,
        new_value: { scheduled_at: form.scheduled_at, type: 'IN_PERSON', status: 'PENDING_IN_PERSON' },
      });

      setCreateOpen(false);
      setReceivedAppt(data);
      load();
    } catch (err) {
      setSaving(false);
      toast({
        title: 'Failed to book appointment',
        description: err instanceof Error ? err.message : 'Booking failed',
        variant: 'destructive',
      });
    }
  };

  const handleUpdate = async () => {
    if (!editAppt || !user?.patient?.id) return;
    if (!form.scheduled_at) {
      toast({ title: 'Please select an available time', variant: 'destructive' });
      return;
    }
    const scheduledDate = new Date(form.scheduled_at);
    if (scheduledDate < new Date()) {
      toast({ title: 'Cannot reschedule to the past', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      await appointmentsApi.update(editAppt.id, {
        scheduled_at: scheduledDate.toISOString(),
        reason: form.reason || null,
      });
      setSaving(false);
    } catch (err) {
      setSaving(false);
      toast({
        title: 'Failed to reschedule',
        description: err instanceof Error ? err.message : 'Update failed',
        variant: 'destructive',
      });
      return;
    }

    await logAudit({
      action: 'UPDATE',
      resource: 'appointments',
      resource_id: editAppt.id,
      patient_id: user.patient.id,
      old_value: { scheduled_at: editAppt.scheduled_at },
      new_value: { scheduled_at: form.scheduled_at },
    });

    toast({ title: 'Appointment rescheduled' });
    setEditAppt(null);
    load();
  };

  const handleCancel = async (reason?: string) => {
    if (!cancelAppt || !user?.patient?.id) return;
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
      patient_id: user.patient.id,
      new_value: { status: 'CANCELLED', reason },
    });

    toast({ title: 'Appointment cancelled', description: 'Reason logged for audit trail' });
    setCancelAppt(null);
    load();
  };

  const activeStatuses = ['PENDING', 'PENDING_IN_PERSON', 'CONFIRMED', 'CONFIRMED_IN_PERSON', 'CONFIRMED_TELEMEDICINE', 'ARRIVED', 'IN_CONSULTATION'];
  const now = new Date();
  const upcoming = appointments.filter(
    (a) =>
      activeStatuses.includes(a.status) &&
      (new Date(a.scheduled_at) >= now ||
        a.status === 'IN_CONSULTATION' ||
        Boolean(a.doctor_joined_at))
  );
  const past = appointments.filter(
    (a) => !upcoming.some((u) => u.id === a.id)
  );

  const joinVideoCall = async (appt: Appointment) => {
    setJoiningId(appt.id);
    try {
      await joinCall({
        appointmentId: appt.id,
        patientId: appt.patient_id,
        patientName: user?.profile?.full_name ?? 'You',
        doctorName: appt.doctor?.profile?.full_name ?? 'Doctor',
        reason: appt.reason,
      });
      setAppointments((prev) =>
        prev.map((a) =>
          a.id === appt.id ? { ...a, patient_joined_at: a.patient_joined_at ?? new Date().toISOString() } : a
        )
      );
      toast({ title: 'Joined virtual waiting room' });
    } catch (err) {
      toast({
        title: 'Could not join',
        description: err instanceof Error ? err.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setJoiningId(null);
    }
  };

  const decideTelemedicine = async (
    id: string,
    decision: 'ACCEPTED_VIDEO' | 'SWITCHED_IN_PERSON'
  ) => {
    setActingId(id);
    try {
      await appointmentsApi.confirmTelemedicineDecision(id, decision);
      toast({
        title: decision === 'ACCEPTED_VIDEO' ? 'Video confirmed' : 'Switched to in-person',
        description: 'Reception and your doctor have been notified.',
      });
      await load();
    } catch (err) {
      toast({
        title: 'Could not save decision',
        description: err instanceof Error ? err.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setActingId(null);
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Book Appointment</h1>
            <p className="text-sm text-muted-foreground">Request a consultation with your doctor</p>
          </div>
          <Button onClick={openCreate} disabled={loading}>
            <Plus className="mr-2 h-4 w-4" />
            Request Appointment
          </Button>
        </div>

        <Tabs defaultValue="upcoming" className="space-y-4">
          <TabsList>
            <TabsTrigger value="upcoming">
              Upcoming
              {upcoming.length > 0 && (
                <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary group-data-[state=active]:bg-primary-foreground/20 group-data-[state=active]:text-primary-foreground">
                  {upcoming.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="history">
              History
              {past.length > 0 && (
                <span className="ml-2 rounded-full bg-muted-foreground/15 px-2 py-0.5 text-xs font-semibold text-muted-foreground group-data-[state=active]:bg-primary-foreground/20 group-data-[state=active]:text-primary-foreground">
                  {past.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="mt-0 space-y-3">
            {loading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
            ) : upcoming.length === 0 ? (
              <EmptyState
                icon={<CalendarDays className="h-10 w-10" />}
                title="No upcoming appointments"
                description="Request your next consultation."
                action={
                  <Button onClick={openCreate}>
                    <Plus className="mr-2 h-4 w-4" />
                    Request Appointment
                  </Button>
                }
              />
            ) : (
              upcoming.map((appt) => {
                const pendingTele = needsTelemedicineConfirm(appt);
                const canEdit =
                  !pendingTele &&
                  (appt.status === 'PENDING' || appt.status === 'PENDING_IN_PERSON');
                const isTele = appt.type === 'TELEMEDICINE';
                const canJoinVideo = !pendingTele && canJoinTelemedicine(appt);
                const waitingForDoctor =
                  isTele &&
                  !pendingTele &&
                  Boolean(appt.patient_joined_at) &&
                  !appt.doctor_joined_at &&
                  appt.status !== 'IN_CONSULTATION';
                const inCall = session?.appointmentId === appt.id && Boolean(livekit);
                return (
                  <Card
                    key={appt.id}
                    className={canEdit ? 'cursor-pointer transition-colors hover:bg-muted/40' : undefined}
                    role={canEdit ? 'button' : undefined}
                    tabIndex={canEdit ? 0 : undefined}
                    onClick={canEdit ? () => openEdit(appt) : undefined}
                    onKeyDown={
                      canEdit
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openEdit(appt);
                            }
                          }
                        : undefined
                    }
                    aria-label={canEdit ? 'View and edit appointment' : undefined}
                  >
                    <CardContent className="flex flex-col gap-3 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                            {isTele ? (
                              <Video className="h-6 w-6 text-primary" />
                            ) : (
                              <Building2 className="h-6 w-6 text-primary" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-foreground">
                              {formatDate(appt.scheduled_at)} at {formatTime(appt.scheduled_at)}
                            </p>
                            <div className="mt-1">
                              <DelayBadge
                                scheduledAt={appt.scheduled_at}
                                delayMinutes={appt.delay_minutes}
                              />
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {appt.doctor?.profile?.full_name ?? 'Your doctor'}
                            </p>
                            {appt.reason && (
                              <p className="text-sm text-muted-foreground">{appt.reason}</p>
                            )}
                            {pendingTele && (
                              <p className="mt-1 text-xs text-amber-700">
                                This telemedicine check-up needs your confirmation before the visit.
                              </p>
                            )}
                            {appt.patient_telemedicine_decision === 'ACCEPTED_VIDEO' && (
                              <p className="mt-1 text-xs text-emerald-700">Video call confirmed</p>
                            )}
                            {appt.patient_telemedicine_decision === 'SWITCHED_IN_PERSON' && (
                              <p className="mt-1 text-xs text-slate-600">Switched to in-person</p>
                            )}
                            {waitingForDoctor && (
                              <p className="mt-1 text-xs text-amber-700">
                                You&apos;re checked in — waiting for your doctor
                              </p>
                            )}
                            {canJoinVideo && !appt.patient_joined_at && (
                              <p className="mt-1 text-xs text-emerald-700">
                                Join the virtual waiting room when you&apos;re ready
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {pendingTele ? (
                            <Badge
                              variant="outline"
                              className="border-amber-200 bg-amber-100 text-amber-800"
                            >
                              Needs confirmation
                            </Badge>
                          ) : (
                            <AppointmentStatusBadge status={appt.status} />
                          )}
                          <AppointmentTypeBadge type={appt.type} />
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCancelAppt(appt);
                              }}
                              aria-label="Delete appointment"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      {pendingTele && (
                        <div className="flex flex-wrap gap-2 border-t pt-3">
                          <Button
                            size="sm"
                            disabled={actingId === appt.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              decideTelemedicine(appt.id, 'ACCEPTED_VIDEO');
                            }}
                          >
                            {actingId === appt.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Video className="mr-2 h-4 w-4" />
                            )}
                            Confirm video call
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actingId === appt.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              decideTelemedicine(appt.id, 'SWITCHED_IN_PERSON');
                            }}
                          >
                            <Building2 className="mr-2 h-4 w-4" />
                            Come in person instead
                          </Button>
                        </div>
                      )}
                      {canJoinVideo && (
                        <div className="flex flex-wrap gap-2 border-t pt-3">
                          <Button
                            size="sm"
                            disabled={joiningId === appt.id || inCall}
                            onClick={(e) => {
                              e.stopPropagation();
                              void joinVideoCall(appt);
                            }}
                          >
                            {joiningId === appt.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Video className="mr-2 h-4 w-4" />
                            )}
                            {inCall ? 'In call' : appt.patient_joined_at ? 'Rejoin' : 'Join waiting room'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push('/patient/telemedicine');
                            }}
                          >
                            Open Telemedicine
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-0">
            {loading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
            ) : past.length === 0 ? (
              <EmptyState
                icon={<CalendarDays className="h-10 w-10" />}
                title="No appointment history"
                description="Past and cancelled appointments will appear here."
              />
            ) : (
              <TableSection title="Appointment history" scrollLabel="Appointment history">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead className="table-priority-medium">Doctor</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {past.map((appt) => (
                          <TableRow key={appt.id}>
                            <TableCell>
                              <div className="text-sm">{formatDate(appt.scheduled_at)}</div>
                              <div className="text-xs text-muted-foreground">
                                {formatTime(appt.scheduled_at)}
                              </div>
                              <div className="mt-1">
                                <DelayBadge scheduledAt={appt.scheduled_at} delayMinutes={appt.delay_minutes} />
                              </div>
                            </TableCell>
                            <TableCell className="table-priority-medium text-sm">
                              {appt.doctor?.profile?.full_name ?? '—'}
                            </TableCell>
                            <TableCell>
                              <AppointmentTypeBadge type={appt.type} />
                            </TableCell>
                            <TableCell>
                              <AppointmentStatusBadge status={appt.status} />
                              {appt.cancellation_reason && (
                                <p className="mt-1 max-w-[200px] text-xs text-muted-foreground">
                                  {appt.cancellation_reason}
                                </p>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
              </TableSection>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Create / Edit dialog */}
      {createOpen || editAppt ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-3 sm:p-4" onClick={() => { setCreateOpen(false); setEditAppt(null); }}>
          <div className="relative my-auto w-full max-w-md overflow-hidden rounded-lg bg-background shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain p-4 safe-pb sm:max-h-[calc(100dvh-2rem)] sm:p-6">
              <h2 className="text-lg font-semibold pr-8">{editAppt ? 'Reschedule Appointment' : 'Request Appointment'}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{editAppt ? 'Choose a new date and time' : 'Submit a request for clinic review'}</p>
              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label>Doctor</Label>
                  <Select
                    value={form.doctor_id}
                    onValueChange={(v) => setForm({ ...form, doctor_id: v, date: '', scheduled_at: '' })}
                    disabled={!!editAppt}
                  >
                    <SelectTrigger><SelectValue placeholder="Select doctor..." /></SelectTrigger>
                    <SelectContent>
                      {doctors.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.profile?.full_name} — {d.specialization}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <SlotPicker
                  doctorId={form.doctor_id}
                  date={form.date}
                  onDateChange={(date) => setForm({ ...form, date })}
                  selectedStart={form.scheduled_at}
                  onSelectStart={(scheduled_at) => setForm({ ...form, scheduled_at })}
                  durationMinutes={30}
                  excludeId={editAppt?.id}
                />
                <div className="space-y-2">
                  <Label>Consultation Type</Label>
                  <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
                    <Building2 className="h-4 w-4" />
                    In Person (at clinic) — assigned by staff after review
                  </div>
                  <p className="text-xs text-muted-foreground">The clinic will determine if your appointment should be in-person or telemedicine after reviewing your request.</p>
                </div>
                <div className="space-y-2">
                  <Label>Reason for Visit</Label>
                  <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={3} placeholder="Briefly describe your symptoms or reason..." />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setCreateOpen(false); setEditAppt(null); }}>Cancel</Button>
                <Button onClick={editAppt ? handleUpdate : handleCreate} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editAppt ? 'Reschedule' : 'Submit Request'}
                </Button>
              </div>
            </div>
            <button
              type="button"
              className="absolute right-4 top-4 rounded-md p-1 text-primary ring-offset-background transition-colors hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              onClick={() => { setCreateOpen(false); setEditAppt(null); }}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      <Dialog open={!!receivedAppt} onOpenChange={(open) => !open && setReceivedAppt(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 sm:mx-0">
              <CheckCircle2 className="h-7 w-7 text-primary" />
            </div>
            <DialogTitle>Appointment request received</DialogTitle>
            <DialogDescription>
              We have received your appointment request. A confirmation was also sent to Messages.
            </DialogDescription>
          </DialogHeader>
          {receivedAppt && (
            <div className="rounded-lg border bg-muted/40 p-4 text-sm">
              <p className="font-medium text-foreground">
                {formatDate(receivedAppt.scheduled_at)} at {formatTime(receivedAppt.scheduled_at)}
              </p>
              <p className="mt-1 text-muted-foreground">
                {receivedAppt.doctor?.profile?.full_name ??
                  doctors.find((d) => d.id === receivedAppt.doctor_id)?.profile?.full_name ??
                  'Your doctor'}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                Status: pending clinic review. Please do not be late. If you need to change the time,
                reschedule from Upcoming before the appointment.
              </p>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setReceivedAppt(null)}>
              Done
            </Button>
            <Button
              onClick={() => {
                setReceivedAppt(null);
                router.push('/patient/messages');
              }}
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              View Messages
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!cancelAppt}
        onOpenChange={(o) => !o && setCancelAppt(null)}
        title="Delete Appointment"
        description="Deleting this will cancel the appointment. It will no longer appear as upcoming for you, your doctor, or clinic staff. A reason is required for the audit trail."
        confirmLabel="Delete Appointment"
        destructive
        requireReason
        reasonLabel="Cancellation Reason"
        onConfirm={handleCancel}
      />
    </>
  );
}
