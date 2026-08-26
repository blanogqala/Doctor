'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/shared/dashboard-layout';
import { AppPage } from '@/components/layout/app-page';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { PatientFolderCard } from '@/components/records/patient-folder-card';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';
import { patientsApi, doctorsApi } from '@/lib/api/patients';
import { medicalRecordsApi } from '@/lib/api/medical-records';
import { authApi } from '@/lib/api/auth';
import { formatDate, formatTime, maskIdNumber } from '@/lib/format';
import type { Patient, Doctor, MedicalRecord } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  Folder, FileText, Plus, Search, Trash2, Lock,
  ArrowLeft, User, AlertTriangle, CalendarPlus, Video,
} from 'lucide-react';
import { CheckUpBookingDialog } from '@/components/appointments/check-up-booking-dialog';
import { AppointmentStatusBadge, AppointmentTypeBadge } from '@/components/shared/badges';

export default function AdminPatientsPage() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedPatientId = searchParams.get('patient');

  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [editPatient, setEditPatient] = useState<Patient | null>(null);
  const [deletePatient, setDeletePatient] = useState<Patient | null>(null);

  const [bookParent, setBookParent] = useState<MedicalRecord | null>(null);

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    id_number: '',
    date_of_birth: '',
    gender: 'UNKNOWN',
    address: '',
    city: '',
    medical_aid_provider: '',
    medical_aid_number: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    assigned_doctor_id: '',
  });

  const loadData = useCallback(async () => {
    const [patientsData, doctorsData, recordsData] = await Promise.all([
      patientsApi.list(),
      doctorsApi.list(),
      medicalRecordsApi.list(),
    ]);
    setPatients(patientsData);
    setDoctors(doctorsData);
    setRecords(recordsData);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === selectedPatientId) ?? null,
    [patients, selectedPatientId]
  );

  const patientRecords = useMemo(
    () => records.filter((r) => r.patient_id === selectedPatientId),
    [records, selectedPatientId]
  );

  const parentRecords = useMemo(() => {
    const parents = patientRecords.filter((r) => !r.parent_record_id);
    const childrenByParent = new Map<string, MedicalRecord[]>();
    for (const r of patientRecords) {
      if (!r.parent_record_id) continue;
      const list = childrenByParent.get(r.parent_record_id) ?? [];
      list.push(r);
      childrenByParent.set(r.parent_record_id, list);
    }
    return parents
      .map((p) => ({
        parent: p,
        checkUps: (childrenByParent.get(p.id) ?? []).sort(
          (a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime()
        ),
      }))
      .sort(
        (a, b) =>
          new Date(b.parent.record_date).getTime() - new Date(a.parent.record_date).getTime()
      );
  }, [patientRecords]);

  const lastVisitDate = useMemo(() => {
    if (patientRecords.length === 0) return null;
    const sorted = [...patientRecords].sort(
      (a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime()
    );
    return sorted[0].record_date;
  }, [patientRecords]);

  const filteredPatients = useMemo(() => {
    if (!search) return patients;
    const q = search.toLowerCase();
    return patients.filter((p) => {
      const name = p.profile?.full_name?.toLowerCase() ?? '';
      const id = p.id_number?.toLowerCase() ?? '';
      return name.includes(q) || id.includes(q);
    });
  }, [patients, search]);

  const openCreate = () => {
    setForm({
      full_name: '',
      email: '',
      phone: '',
      id_number: '',
      date_of_birth: '',
      gender: 'UNKNOWN',
      address: '',
      city: '',
      medical_aid_provider: '',
      medical_aid_number: '',
      emergency_contact_name: '',
      emergency_contact_phone: '',
      assigned_doctor_id: doctors[0]?.id ?? '',
    });
    setCreateOpen(true);
  };

  const openEdit = (p: Patient) => {
    setEditPatient(p);
    setForm({
      full_name: p.profile?.full_name ?? '',
      email: p.profile?.email ?? '',
      phone: p.profile?.phone ?? '',
      id_number: p.id_number ?? '',
      date_of_birth: p.date_of_birth ?? '',
      gender: p.gender,
      address: p.address ?? '',
      city: p.city ?? '',
      medical_aid_provider: p.medical_aid_provider ?? '',
      medical_aid_number: p.medical_aid_number ?? '',
      emergency_contact_name: p.emergency_contact_name ?? '',
      emergency_contact_phone: p.emergency_contact_phone ?? '',
      assigned_doctor_id: p.assigned_doctor_id ?? '',
    });
  };

  const handleCreate = async () => {
    if (!form.full_name || !form.email) {
      toast({ title: 'Name and email are required', variant: 'destructive' });
      return;
    }

    const { exists } = await patientsApi.checkEmail(form.email);
    if (exists) {
      toast({ title: 'Email already in use', description: 'A user with this email already exists.', variant: 'destructive' });
      return;
    }

    if (form.id_number && !/^\d{13}$/.test(form.id_number)) {
      toast({ title: 'Invalid ID number', description: 'SA ID must be 13 digits.', variant: 'destructive' });
      return;
    }

    try {
      const result = await authApi.adminCreatePatient({
        email: form.email,
        full_name: form.full_name,
        phone: form.phone,
        patient: {
          id_number: form.id_number || null,
          date_of_birth: form.date_of_birth || null,
          gender: form.gender,
          address: form.address || null,
          city: form.city || null,
          province: 'Eastern Cape',
          medical_aid_provider: form.medical_aid_provider || null,
          medical_aid_number: form.medical_aid_number || null,
          emergency_contact_name: form.emergency_contact_name || null,
          emergency_contact_phone: form.emergency_contact_phone || null,
          assigned_doctor_id: form.assigned_doctor_id || null,
        },
      });

      await logAudit({
        action: 'CREATE',
        resource: 'patients',
        resource_id: result.user.id,
        new_value: { full_name: form.full_name, email: form.email },
      });

      toast({
        title: 'Patient created',
        description: result.uat_activation_url
          ? 'Activation invitation issued. UAT activation link is available to copy.'
          : result.email_delivered
            ? `Activation invitation issued to ${form.email}`
            : 'Patient created. Activation invitation issued.',
      });
      if (result.uat_activation_url && typeof navigator !== 'undefined' && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(result.uat_activation_url);
          toast({ title: 'UAT activation link copied' });
        } catch {
          // ignore clipboard failures
        }
      }
      setCreateOpen(false);
      loadData();
    } catch (err) {
      toast({
        title: 'Failed to create patient',
        description: err instanceof Error ? err.message : 'Create failed',
        variant: 'destructive',
      });
    }
  };

  const handleUpdate = async () => {
    if (!editPatient || !editPatient.profile) return;

    if (form.email !== editPatient.profile.email) {
      const { exists } = await patientsApi.checkEmail(form.email);
      if (exists) {
        toast({ title: 'Email already in use', description: 'Another user already has this email.', variant: 'destructive' });
        return;
      }
    }

    if (form.id_number !== (editPatient.id_number ?? '')) {
      const { count } = await patientsApi.countMedicalRecords(editPatient.id);
      if (count > 0) {
        toast({
          title: 'Cannot change ID number',
          description: 'Medical records are linked to this patient. ID number cannot be changed for legal integrity.',
          variant: 'destructive',
        });
        return;
      }
    }

    const oldValues = {
      full_name: editPatient.profile.full_name,
      email: editPatient.profile.email,
      phone: editPatient.profile.phone,
      address: editPatient.address,
      city: editPatient.city,
      medical_aid_provider: editPatient.medical_aid_provider,
    };

    try {
      await patientsApi.update(editPatient.id, {
        full_name: form.full_name,
        phone: form.phone || null,
        date_of_birth: form.date_of_birth || null,
        gender: form.gender,
        address: form.address || null,
        city: form.city || null,
        medical_aid_provider: form.medical_aid_provider || null,
        medical_aid_number: form.medical_aid_number || null,
        emergency_contact_name: form.emergency_contact_name || null,
        emergency_contact_phone: form.emergency_contact_phone || null,
        assigned_doctor_id: form.assigned_doctor_id || null,
      });
    } catch (err) {
      toast({
        title: 'Failed to update patient',
        description: err instanceof Error ? err.message : 'Update failed',
        variant: 'destructive',
      });
      return;
    }

    await logAudit({
      action: 'UPDATE',
      resource: 'patients',
      resource_id: editPatient.id,
      patient_id: editPatient.id,
      old_value: oldValues,
      new_value: { full_name: form.full_name, phone: form.phone, address: form.address, city: form.city },
    });

    toast({ title: 'Patient updated successfully' });
    setEditPatient(null);
    loadData();
  };

  const handleDelete = async (reason?: string) => {
    if (!deletePatient) return;
    const archivedId = deletePatient.id;
    try {
      await patientsApi.softDelete(deletePatient.id);
    } catch (err) {
      toast({
        title: 'Failed to archive patient',
        description: err instanceof Error ? err.message : 'Archive failed',
        variant: 'destructive',
      });
      return;
    }

    await logAudit({
      action: 'SOFT_DELETE',
      resource: 'patients',
      resource_id: deletePatient.id,
      patient_id: deletePatient.id,
      new_value: { soft_deleted_at: new Date().toISOString(), reason },
    });

    toast({ title: 'Patient archived', description: 'Medical history preserved for legal compliance' });
    setDeletePatient(null);
    if (selectedPatientId === archivedId) {
      router.push('/admin/patients');
    }
    loadData();
  };

  const createEditDialog = (
    <Dialog open={createOpen || !!editPatient} onOpenChange={(o) => { if (!o) { setCreateOpen(false); setEditPatient(null); } }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editPatient ? 'Edit Patient' : 'Register New Patient'}</DialogTitle>
          <DialogDescription>
            {editPatient ? 'Update patient contact and demographic information' : 'Create a new patient account and profile'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!!editPatient} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>SA ID Number</Label>
              <Input
                value={form.id_number}
                onChange={(e) => setForm({ ...form, id_number: e.target.value })}
                maxLength={13}
                disabled={!!editPatient && !!editPatient.id_number}
                placeholder="13 digits"
              />
              {editPatient?.id_number && (
                <p className="text-xs text-muted-foreground">
                  ID number locked — cannot change when medical records exist
                </p>
              )}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Date of Birth</Label>
              <Input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Gender</Label>
              <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UNKNOWN">Unknown</SelectItem>
                  <SelectItem value="MALE">Male</SelectItem>
                  <SelectItem value="FEMALE">Female</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>City / Town</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Medical Aid Provider</Label>
              <Input value={form.medical_aid_provider} onChange={(e) => setForm({ ...form, medical_aid_provider: e.target.value })} placeholder="e.g. Discovery Health" />
            </div>
            <div className="space-y-2">
              <Label>Medical Aid Number</Label>
              <Input value={form.medical_aid_number} onChange={(e) => setForm({ ...form, medical_aid_number: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Emergency Contact Name</Label>
              <Input value={form.emergency_contact_name} onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Emergency Contact Phone</Label>
              <Input value={form.emergency_contact_phone} onChange={(e) => setForm({ ...form, emergency_contact_phone: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Assigned Doctor</Label>
            <Select value={form.assigned_doctor_id} onValueChange={(v) => setForm({ ...form, assigned_doctor_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select doctor..." /></SelectTrigger>
              <SelectContent>
                {doctors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.profile?.full_name} — {d.specialization}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setCreateOpen(false); setEditPatient(null); }}>Cancel</Button>
          <Button onClick={editPatient ? handleUpdate : handleCreate}>{editPatient ? 'Update' : 'Register'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const archiveDialog = (
    <ConfirmDialog
      open={!!deletePatient}
      onOpenChange={(o) => !o && setDeletePatient(null)}
      title="Archive Patient"
      description={`Archive ${deletePatient?.profile?.full_name ?? 'this patient'}? Their medical history will be preserved for legal compliance, but they will no longer appear in active lists.`}
      confirmLabel="Archive Patient"
      destructive
      requireReason
      reasonLabel="Reason for Archiving"
      onConfirm={handleDelete}
    />
  );

  if (selectedPatientId && selectedPatient) {
    return (
      <DashboardLayout>
        <AppPage>
          <Button variant="outline" onClick={() => router.push('/admin/patients')} className="group">
            <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            Back to Folders
          </Button>

          <Card className="animate-slide-up">
            <CardContent className="p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                      <User className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-foreground">{selectedPatient.profile?.full_name}</h2>
                      <p className="text-sm text-muted-foreground">
                        ID: {maskIdNumber(selectedPatient.id_number) ?? '—'}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Date of Birth</p>
                      <p className="font-medium text-foreground">
                        {selectedPatient.date_of_birth ? formatDate(selectedPatient.date_of_birth) : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Gender</p>
                      <p className="font-medium text-foreground">{selectedPatient.gender.toLowerCase()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Emergency Contact</p>
                      <p className="font-medium text-foreground">
                        {selectedPatient.emergency_contact_name ?? '—'}
                        {selectedPatient.emergency_contact_phone ? ` (${selectedPatient.emergency_contact_phone})` : ''}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Medical Aid</p>
                      <p className="font-medium text-foreground">
                        {selectedPatient.medical_aid_provider ?? '—'}
                        {selectedPatient.medical_aid_number ? ` (${selectedPatient.medical_aid_number})` : ''}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Last Visit</p>
                      <p className="font-medium text-foreground">
                        {lastVisitDate ? formatDate(lastVisitDate) : 'No visits yet'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Assigned Doctor</p>
                      <p className="font-medium text-foreground">
                        {selectedPatient.assigned_doctor?.profile?.full_name ?? 'Unassigned'}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  {!selectedPatient.profile?.activated_at && (
                    <Button
                      variant="outline"
                      onClick={async () => {
                        try {
                          const result = await authApi.resendPatientActivation(
                            selectedPatient.profile_id || selectedPatient.profile!.id
                          );
                          toast({
                            title: 'Activation invitation resent',
                            description: result.email_delivered
                              ? 'Email sent.'
                              : result.message,
                          });
                          if (result.uat_activation_url && navigator.clipboard) {
                            await navigator.clipboard.writeText(result.uat_activation_url);
                            toast({ title: 'UAT activation link copied' });
                          }
                        } catch (err) {
                          toast({
                            title: 'Resend failed',
                            description: err instanceof Error ? err.message : 'Could not resend',
                            variant: 'destructive',
                          });
                        }
                      }}
                    >
                      Resend activation
                    </Button>
                  )}
                  <Button onClick={() => openEdit(selectedPatient)}>
                    Edit Information
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setDeletePatient(selectedPatient)}
                    aria-label="Archive patient"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <Lock className="h-5 w-5 flex-shrink-0 text-amber-600" />
            <p className="text-sm text-amber-800">
              Medical records are listed for reference only and <strong>cannot be opened</strong> by reception staff.
            </p>
          </div>

          <div>
            <h3 className="mb-3 text-lg font-semibold text-foreground">Visit history</h3>
            <p className="mb-3 text-sm text-muted-foreground">
              Operational visit list only — clinical content is not available to reception.
            </p>
            {parentRecords.length === 0 ? (
              <EmptyState
                icon={<FileText className="h-10 w-10" />}
                title="No visits on file"
                description="This patient has no medical record visits yet."
              />
            ) : (
              <div className="space-y-3">
                {parentRecords.map(({ parent: rec, checkUps }, idx) => {
                  return (
                    <div key={rec.id} className="space-y-2">
                      <Card
                        className={cn(
                          'animate-fade-in shadow-sm',
                          rec.is_erroneous && 'border-destructive/30 bg-destructive/5'
                        )}
                        style={{ animationDelay: `${idx * 0.05}s` }}
                      >
                        <CardContent className="p-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-foreground">
                                  Consultation · {formatDate(rec.record_date, true)}
                                </p>
                                <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                              </div>
                              <p className="mt-1 text-sm text-muted-foreground">
                                Clinical details hidden
                              </p>
                            </div>
                            <div className="flex flex-shrink-0 flex-col items-end gap-2">
                              <div className="flex flex-wrap justify-end gap-1.5">
                                {rec.is_draft ? (
                                  <Badge variant="secondary">Draft</Badge>
                                ) : (
                                  <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                                    Finalized
                                  </Badge>
                                )}
                                {rec.is_erroneous && (
                                  <Badge variant="destructive" className="text-xs">
                                    <AlertTriangle className="mr-1 h-3 w-3" /> Erroneous
                                  </Badge>
                                )}
                              </div>
                              {!rec.is_erroneous && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8"
                                  onClick={() => setBookParent(rec)}
                                >
                                  <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
                                  Book
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {checkUps.length > 0 && (
                        <div className="ml-4 space-y-2 border-l-2 border-primary pl-3 sm:ml-6">
                          {checkUps.map((child) => {
                            const appt = child.appointment;
                            return (
                              <Card key={child.id} className="shadow-sm">
                                <CardContent className="p-3">
                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-sm font-medium text-foreground">
                                          Follow-up
                                          {appt
                                            ? ` · ${formatDate(appt.scheduled_at, true)}`
                                            : ` · ${formatDate(child.record_date, true)}`}
                                        </p>
                                        <Lock className="h-3 w-3 text-muted-foreground" />
                                      </div>
                                      <p className="mt-1 text-xs text-muted-foreground">
                                        {appt?.scheduled_at
                                          ? formatTime(appt.scheduled_at)
                                          : 'Scheduled follow-up'}
                                      </p>
                                      {appt?.patient_telemedicine_decision === 'PENDING' && (
                                        <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                                          <Video className="h-3 w-3" />
                                          Awaiting patient telemedicine confirmation
                                        </p>
                                      )}
                                      {appt?.patient_telemedicine_decision === 'SWITCHED_IN_PERSON' && (
                                        <p className="mt-1 text-xs text-slate-600">
                                          Patient switched to in-person
                                        </p>
                                      )}
                                      {appt?.patient_telemedicine_decision === 'ACCEPTED_VIDEO' && (
                                        <p className="mt-1 text-xs text-emerald-700">
                                          Patient confirmed video call
                                        </p>
                                      )}
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {appt && <AppointmentTypeBadge type={appt.type} />}
                                      {appt && <AppointmentStatusBadge status={appt.status} />}
                                      {child.is_draft ? (
                                        <Badge variant="secondary">Draft</Badge>
                                      ) : (
                                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                                          Finalized
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        {selectedPatient && bookParent && (
          <CheckUpBookingDialog
            open={!!bookParent}
            onOpenChange={(o) => {
              if (!o) setBookParent(null);
            }}
            patient={selectedPatient}
            parentRecord={bookParent}
            doctors={doctors}
            onBooked={() => {
              setBookParent(null);
              loadData();
            }}
          />
        )}

        {createEditDialog}
        {archiveDialog}
        </AppPage>
      </DashboardLayout>
    );
  }

  if (selectedPatientId && loading) {
    return (
      <DashboardLayout>
        <AppPage>
          <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
          {createEditDialog}
          {archiveDialog}
        </AppPage>
      </DashboardLayout>
    );
  }

  const patientRowMeta = (p: Patient) => {
    const pRecords = records.filter((r) => r.patient_id === p.id);
    const lastVisit =
      pRecords.length > 0
        ? [...pRecords].sort(
            (a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime()
          )[0].record_date
        : null;
    return { pRecords, lastVisit };
  };

  return (
    <DashboardLayout>
      <AppPage>
        <PageHeader
          title="Patients"
          description="Patient folders — open a folder to manage registration details"
          actions={
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Register Patient
            </Button>
          }
        />

        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or ID number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label="Search patients"
          />
        </div>

        {loading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
        ) : filteredPatients.length === 0 ? (
          <EmptyState
            icon={<Folder className="h-10 w-10" />}
            title="No patient folders"
            description={search ? 'No patients match your search.' : 'Register a new patient to get started.'}
            action={
              !search ? (
                <Button onClick={openCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  Register Patient
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredPatients.map((p) => {
              const { pRecords, lastVisit } = patientRowMeta(p);
              return (
                <PatientFolderCard
                  key={p.id}
                  name={p.profile?.full_name ?? 'Unknown'}
                  statusLabel={p.soft_deleted_at ? 'Archived' : 'Active'}
                  statusTone={p.soft_deleted_at ? 'neutral' : 'success'}
                  idLabel={`Patient ID: ${maskIdNumber(p.id_number) ?? '—'}`}
                  lastVisitLabel={`Last visit: ${lastVisit ? formatDate(lastVisit) : 'No visits'}`}
                  recordsLabel={`${pRecords.length} record${pRecords.length !== 1 ? 's' : ''}`}
                  onClick={() => router.push(`/admin/patients?patient=${p.id}`)}
                />
              );
            })}
          </div>
        )}

        {createEditDialog}
        {archiveDialog}
      </AppPage>
    </DashboardLayout>
  );
}
