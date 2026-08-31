'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { DashboardLayout } from '@/components/shared/dashboard-layout';
import { AppPage, Section } from '@/components/layout/app-page';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/ds/error-state';
import { ClinicalSummary } from '@/components/records/clinical-section';
import { ClinicalTimeline } from '@/components/records/clinical-timeline';
import { ConsultationCard } from '@/components/records/consultation-card';
import { PatientFolderHeader } from '@/components/records/patient-folder-header';
import { PatientFolderSkeleton } from '@/components/records/patient-folder-skeleton';
import { PatientFolderSectionNav } from '@/components/records/patient-folder-section-nav';
import { PatientFolderCard } from '@/components/records/patient-folder-card';
import { ClinicalIntegrityNotice } from '@/components/records/clinical-integrity-notice';
import {
  ConsultationStatusFilter,
  type ConsultationStatusFilterValue,
} from '@/components/records/consultation-status-filter';
import { RecordStatusBadge } from '@/components/records/record-status';
import { CheckUpBookingDialog } from '@/components/appointments/check-up-booking-dialog';
import { StatusBadge } from '@/components/ds/status-badge';
import { medicalRecordsApi } from '@/lib/api/medical-records';
import { patientsApi, doctorsApi } from '@/lib/api/patients';
import { appointmentsApi } from '@/lib/api/appointments';
import { formatDate, maskIdNumber } from '@/lib/format';
import { patientDisplayName } from '@/lib/patients/display-name';
import {
  PATIENT_FOLDER_SECTIONS,
  buildClinicalTimeline,
  buildConsultationTree,
  buildPatientFolderOverview,
  parseFolderSection,
  recordComplaintSummary,
  type ClinicalTimelineEvent,
  type PatientFolderSection,
} from '@/lib/clinical/patient-folder';
import type { Appointment, Doctor, MedicalRecord, Patient } from '@/lib/types';
import { Calendar, FileText, Folder, Search } from 'lucide-react';

export default function DoctorRecordsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedPatientId = searchParams.get('patient');
  const section = parseFolderSection(searchParams.get('section'));

  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [apptsError, setApptsError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [bookParent, setBookParent] = useState<MedicalRecord | null>(null);
  const [statusFilter, setStatusFilter] = useState<ConsultationStatusFilterValue>('all');

  const load = useCallback(async () => {
    if (!user?.doctor?.id) return;
    setLoading(true);
    setRecordsError(null);

    const [recordsResult, patientsResult, doctorsResult] = await Promise.allSettled([
      medicalRecordsApi.list({ doctor_id: user.doctor.id }),
      patientsApi.list(),
      doctorsApi.list(),
    ]);

    if (recordsResult.status === 'fulfilled') {
      setRecords(recordsResult.value);
    } else {
      setRecordsError(
        recordsResult.reason instanceof Error
          ? recordsResult.reason.message
          : 'Failed to load medical records'
      );
      setRecords([]);
    }

    if (patientsResult.status === 'fulfilled') {
      setPatients(
        patientsResult.value.filter((p) => p.assigned_doctor_id === user.doctor!.id)
      );
    } else {
      setPatients([]);
    }

    if (doctorsResult.status === 'fulfilled') {
      setDoctors(doctorsResult.value);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedPatientId) {
      setAppointments([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const appts = await appointmentsApi.list({ patient_id: selectedPatientId });
        if (!cancelled) {
          setAppointments(appts);
          setApptsError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setAppointments([]);
          setApptsError(
            err instanceof Error ? err.message : 'Failed to load appointments'
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedPatientId]);

  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === selectedPatientId) ?? null,
    [patients, selectedPatientId]
  );

  const patientRecords = useMemo(
    () => records.filter((r) => r.patient_id === selectedPatientId),
    [records, selectedPatientId]
  );

  const consultationTree = useMemo(
    () => buildConsultationTree(patientRecords),
    [patientRecords]
  );

  const overview = useMemo(
    () => buildPatientFolderOverview(patientRecords, appointments),
    [patientRecords, appointments]
  );

  const timeline = useMemo(
    () =>
      buildClinicalTimeline(patientRecords, appointments, {
        patientId: selectedPatientId ?? undefined,
        basePath: 'doctor',
      }),
    [patientRecords, appointments, selectedPatientId]
  );

  const filteredConsultations = useMemo(() => {
    return consultationTree.filter(({ parent, followUps }) => {
      if (statusFilter === 'all') return true;
      const match = (r: MedicalRecord) =>
        statusFilter === 'draft' ? r.is_draft : !r.is_draft;
      return match(parent) || followUps.some(match);
    });
  }, [consultationTree, statusFilter]);

  const filteredPatients = useMemo(() => {
    if (!search) return patients;
    const q = search.toLowerCase();
    return patients.filter((p) => {
      const name = patientDisplayName(p).toLowerCase();
      const id = p.id_number?.toLowerCase() ?? '';
      return name.includes(q) || id.includes(q);
    });
  }, [patients, search]);

  const setSection = (next: PatientFolderSection) => {
    if (!selectedPatientId) return;
    const params = new URLSearchParams();
    params.set('patient', selectedPatientId);
    if (next !== 'overview') params.set('section', next);
    router.push(`/doctor/records?${params.toString()}`);
  };

  const openRecord = (recordId: string, editDraft = false) => {
    if (!selectedPatientId) return;
    if (editDraft) {
      router.push(`/doctor/records/${selectedPatientId}/edit/${recordId}`);
      return;
    }
    router.push(`/doctor/records/${selectedPatientId}/view/${recordId}`);
  };

  const onTimelineOpen = (event: ClinicalTimelineEvent) => {
    if (event.href) router.push(event.href);
  };

  const primaryBookParent =
    consultationTree.find((n) => !n.parent.is_erroneous)?.parent ?? null;

  if (selectedPatientId && selectedPatient) {
    return (
      <DashboardLayout>
        <AppPage>
          <PatientFolderHeader
            patient={selectedPatient}
            onBack={() => router.push('/doctor/records')}
            onNewConsultation={() =>
              router.push(`/doctor/records/${selectedPatient.id}/new`)
            }
            onBookFollowUp={
              primaryBookParent ? () => setBookParent(primaryBookParent) : undefined
            }
          />

          <ClinicalIntegrityNotice />

          {recordsError && (
            <ErrorState
              title="Could not load clinical records"
              message={recordsError}
              onRetry={load}
            />
          )}

          <Tabs
            value={section}
            onValueChange={(v) => setSection(v as PatientFolderSection)}
            className="min-w-0"
          >
            <PatientFolderSectionNav sections={PATIENT_FOLDER_SECTIONS} />

            <TabsContent value="overview" className="mt-4 space-y-4">
              {patientRecords.length === 0 ? (
                <EmptyState
                  icon={<FileText className="h-10 w-10" />}
                  title="No clinical records yet"
                  description="Start a consultation to create the first medical record."
                  action={
                    <Button
                      onClick={() =>
                        router.push(`/doctor/records/${selectedPatient.id}/new`)
                      }
                    >
                      New Consultation
                    </Button>
                  }
                />
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <ClinicalSummary>
                      <p className="mb-1 text-xs text-muted-foreground">Medical records</p>
                      <p className="text-lg font-semibold tabular-nums">
                        {overview.recordCount}
                      </p>
                      <p className="mt-auto pt-1 text-xs text-muted-foreground">
                        {overview.draftCount} draft · {overview.finalizedCount} finalized
                      </p>
                    </ClinicalSummary>
                    <ClinicalSummary>
                      <p className="mb-1 text-xs text-muted-foreground">Latest consultation</p>
                      {overview.latestConsultation ? (
                        <>
                          <p className="text-lg font-semibold">
                            {formatDate(overview.latestConsultation.record_date, true)}
                          </p>
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {recordComplaintSummary(overview.latestConsultation)}
                          </p>
                          <div className="mt-auto pt-2">
                            <RecordStatusBadge record={overview.latestConsultation} />
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">None</p>
                      )}
                    </ClinicalSummary>
                    <ClinicalSummary>
                      <p className="mb-1 text-xs text-muted-foreground">Next appointment</p>
                      {apptsError ? (
                        <p className="text-sm text-muted-foreground">Unavailable</p>
                      ) : overview.nextAppointment ? (
                        <>
                          <p className="text-lg font-semibold">
                            {formatDate(overview.nextAppointment.scheduled_at, true)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {overview.nextAppointment.reason ??
                              overview.nextAppointment.type.replace(/_/g, ' ')}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">None scheduled</p>
                      )}
                    </ClinicalSummary>
                    <ClinicalSummary>
                      <p className="mb-1 text-xs text-muted-foreground">Outstanding follow-up</p>
                      {overview.outstandingFollowUp?.follow_up_date ? (
                        <>
                          <p className="text-lg font-semibold">
                            {formatDate(overview.outstandingFollowUp.follow_up_date)}
                          </p>
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {recordComplaintSummary(overview.outstandingFollowUp)}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">None recorded</p>
                      )}
                    </ClinicalSummary>
                  </div>

                  {overview.recentDiagnoses.length > 0 && (
                    <Section title="Recent diagnoses">
                      <ul className="flex flex-wrap gap-2">
                        {overview.recentDiagnoses.map((dx) => (
                          <li key={dx}>
                            <StatusBadge tone="info" label={dx} className="normal-case" />
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  <Section title="Clinical timeline">
                    <div className="max-h-[28rem] overflow-y-auto overscroll-contain rounded-xl border border-primary/40 bg-primary-soft/50 p-3 scrollbar-thin sm:max-h-[32rem] sm:p-4">
                      <ClinicalTimeline
                        events={timeline}
                        onOpen={onTimelineOpen}
                        className="divide-border/60"
                        empty={
                          <div className="flex flex-col items-center gap-2 py-10 text-center">
                            <Calendar className="h-8 w-8 text-muted-foreground" aria-hidden />
                            <p className="text-sm font-medium text-foreground">
                              No timeline events yet
                            </p>
                            <p className="max-w-sm text-xs text-muted-foreground">
                              Consultations and appointments will appear here.
                            </p>
                          </div>
                        }
                      />
                    </div>
                  </Section>
                </>
              )}
            </TabsContent>

            <TabsContent value="consultations" className="mt-4 space-y-4">
              <ConsultationStatusFilter value={statusFilter} onChange={setStatusFilter} />

              {filteredConsultations.length === 0 ? (
                <EmptyState
                  icon={<FileText className="h-10 w-10" />}
                  title="No consultations match this filter"
                  description="Adjust the status filter or start a new consultation."
                />
              ) : (
                <div className="space-y-4">
                  {filteredConsultations.map(({ parent, followUps }) => (
                    <div key={parent.id} className="space-y-2">
                      <ConsultationCard
                        record={parent}
                        onOpen={() => openRecord(parent.id)}
                      />
                      {followUps.length > 0 && (
                        <div className="ml-3 space-y-2 border-l-2 border-primary/40 pl-3 sm:ml-5">
                          <p className="text-xs font-medium text-muted-foreground">
                            Follow-ups
                          </p>
                          {followUps.map((child) => (
                            <ConsultationCard
                              key={child.id}
                              record={child}
                              variant="follow_up"
                              onOpen={() => openRecord(child.id)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>

          {bookParent && (
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
                load();
              }}
            />
          )}
        </AppPage>
      </DashboardLayout>
    );
  }

  if (selectedPatientId && !loading && !selectedPatient) {
    return (
      <DashboardLayout>
        <AppPage>
          <ErrorState
            kind="not_found"
            title="Patient not found"
            message="This patient is not in your assigned patient list, or the link is invalid."
            onRetry={() => router.push('/doctor/records')}
          />
        </AppPage>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <AppPage>
        <PageHeader
          title="Patient Folders"
          description="Longitudinal clinical history for your assigned patients."
        />

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by patient name or ID number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-11 pl-9"
            aria-label="Search patient folders"
          />
        </div>

        {loading ? (
          <PatientFolderSkeleton />
        ) : recordsError ? (
          <ErrorState
            title="Could not load patient folders"
            message={recordsError}
            onRetry={load}
          />
        ) : filteredPatients.length === 0 ? (
          <EmptyState
            icon={<Folder className="h-10 w-10" />}
            title="No patient folders"
            description={
              search
                ? 'No patients match your search.'
                : 'No patients are assigned to you yet.'
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredPatients.map((p) => {
              const pRecords = records.filter((r) => r.patient_id === p.id);
              const lastVisit =
                pRecords.length > 0
                  ? [...pRecords].sort(
                      (a, b) =>
                        new Date(b.record_date).getTime() -
                        new Date(a.record_date).getTime()
                    )[0].record_date
                  : null;
              const draftCount = pRecords.filter((r) => r.is_draft).length;
              return (
                <PatientFolderCard
                  key={p.id}
                  name={patientDisplayName(p)}
                  statusLabel={p.soft_deleted_at ? 'Archived' : 'Active'}
                  statusTone={p.soft_deleted_at ? 'neutral' : 'success'}
                  idLabel={`Patient ID: ${maskIdNumber(p.id_number) ?? '—'}`}
                  lastVisitLabel={`Last visit: ${lastVisit ? formatDate(lastVisit) : 'No visits'}`}
                  recordsLabel={`${pRecords.length} medical record${pRecords.length !== 1 ? 's' : ''}${
                    draftCount > 0 ? ` · ${draftCount} draft` : ''
                  }`}
                  onClick={() => router.push(`/doctor/records?patient=${p.id}`)}
                />
              );
            })}
          </div>
        )}
      </AppPage>
    </DashboardLayout>
  );
}
