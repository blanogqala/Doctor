'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { DashboardLayout } from '@/components/shared/dashboard-layout';
import { AppPage } from '@/components/layout/app-page';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { RecordViewChrome } from '@/components/records/record-view-chrome';
import { RecordSubTabs } from '@/components/records/record-sub-tabs';
import { ClinicalNotesReadOnly } from '@/components/records/clinical-notes-readonly';
import { DoctorsNotesTab } from '@/components/records/doctors-notes-tab';
import { ConsultationEvidence } from '@/components/records/consultation-evidence';
import { CheckupTelemedicinePanel } from '@/components/records/checkup-telemedicine-panel';
import { AmendmentsList } from '@/components/records/amendments-list';
import { RecordStatusBadge } from '@/components/records/record-status';
import { ClinicalRecordSkeleton } from '@/components/records/patient-folder-skeleton';
import { ErrorState } from '@/components/ds/error-state';
import { StatusBadge } from '@/components/ds/status-badge';
import { useToast } from '@/hooks/use-toast';
import { medicalRecordsApi } from '@/lib/api/medical-records';
import { formatDate, maskIdNumber } from '@/lib/format';
import { doctorDisplayName } from '@/lib/clinical/patient-folder';
import { normalizeDoctorNotes, recordWasEdited } from '@/lib/doctor-notes';
import type { MedicalRecord } from '@/lib/types';
import { AlertTriangle, Pencil, X } from 'lucide-react';

export default function ViewClinicalRecordPage() {
  const params = useParams<{ patientId: string; recordId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [record, setRecord] = useState<MedicalRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('clinical');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await medicalRecordsApi.getById(params.recordId);
      setRecord(data);
      const checkup = Boolean(data.parent_record_id);
      const telemed = checkup && data.appointment?.type === 'TELEMEDICINE';
      const tabParam = searchParams.get('tab');
      if (tabParam && ['clinical', 'prescription', 'referral', 'notes'].includes(tabParam)) {
        setActiveTab(tabParam);
      } else if (telemed || checkup) {
        setActiveTab('clinical');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Not found';
      setError(message);
      setRecord(null);
      toast({
        title: 'Failed to load record',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [params.recordId, searchParams, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const folderHref = `/doctor/records?patient=${params.patientId}`;
  const patient = record?.patient;
  const patientName = patient?.profile?.full_name ?? 'Unknown Patient';
  const doctorName = record?.doctor?.profile?.full_name ?? 'Unknown Doctor';
  const isAuthor = !!(user?.doctor?.id && record?.doctor_id === user.doctor.id);
  const canEdit = isAuthor && !!record && !record.is_erroneous;
  const edited = record ? recordWasEdited(record.created_at, record.updated_at) : false;
  const privateNotes = normalizeDoctorNotes(record?.doctor_notes_private);
  const amended = (record?.amendments?.length ?? 0) > 0;

  const genderLabel = patient?.gender
    ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1).toLowerCase()
    : null;
  const patientSubtitle = [maskIdNumber(patient?.id_number ?? null) ?? '—', genderLabel]
    .filter(Boolean)
    .join(' • ');

  if (loading) {
    return (
      <DashboardLayout>
        <AppPage>
          <ClinicalRecordSkeleton />
        </AppPage>
      </DashboardLayout>
    );
  }

  if (!record) {
    return (
      <DashboardLayout>
        <AppPage>
          <ErrorState
            kind="not_found"
            title="Medical record not found"
            message={error ?? 'This consultation record is unavailable.'}
            onRetry={() => router.push(folderHref)}
          />
        </AppPage>
      </DashboardLayout>
    );
  }

  const isCheckup = Boolean(record.parent_record_id);
  const isTelemedicineCheckup = isCheckup && record.appointment?.type === 'TELEMEDICINE';
  const editHref = `/doctor/records/${params.patientId}/edit/${record.id}${
    isTelemedicineCheckup ? '?tab=clinical' : ''
  }`;

  return (
    <DashboardLayout>
      <AppPage>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <RecordViewChrome
            title={patientName}
            subtitle={patientSubtitle}
            actions={
              <>
                {canEdit && record.is_draft && (
                  <Button variant="default" onClick={() => router.push(editHref)}>
                    <Pencil className="mr-2 h-4 w-4" /> Continue Editing
                  </Button>
                )}
                {canEdit && !record.is_draft && (
                  <Button variant="outline" onClick={() => router.push(editHref)}>
                    <Pencil className="mr-2 h-4 w-4" /> Amend / Review
                  </Button>
                )}
                <Button variant="outline" onClick={() => router.push(folderHref)}>
                  <X className="mr-2 h-4 w-4" /> Close
                </Button>
              </>
            }
            tabs={
              <RecordSubTabs
                sticky={false}
                variant={isCheckup ? 'checkup' : 'doctor'}
                clinicalLabel={isTelemedicineCheckup ? 'Telemedicine' : 'Clinical Notes'}
              />
            }
          />

          {isCheckup && record.parent_record_id && (
            <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
              Follow-up to consultation
              {record.parent_record_id ? (
                <>
                  {' '}
                  —{' '}
                  <button
                    type="button"
                    className="font-medium text-primary underline-offset-2 hover:underline"
                    onClick={() =>
                      router.push(
                        `/doctor/records/${params.patientId}/view/${record.parent_record_id}`
                      )
                    }
                  >
                    open parent consultation
                  </button>
                </>
              ) : null}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <RecordStatusBadge record={record} amended={amended && !record.is_draft} />
            <span>
              {formatDate(record.record_date, true)} · {doctorDisplayName(doctorName)}
            </span>
            {edited && !record.is_draft && (
              <StatusBadge tone="warning" label="Updated before finalize" className="normal-case" />
            )}
            {record.is_erroneous && (
              <span className="inline-flex items-center gap-1 text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" /> Marked erroneous
              </span>
            )}
          </div>

          {!record.is_draft && (
            <p className="mt-2 text-xs text-muted-foreground">
              This medical record is finalized and shown read-only. Corrections use amendments.
            </p>
          )}
          {record.is_draft && (
            <p className="mt-2 text-xs text-warning-foreground">
              Draft — not a finalized clinical record. Continue editing or finalize when complete.
            </p>
          )}

          <div className="mt-4 space-y-4">
            <TabsContent value="clinical" className="mt-0 space-y-4">
              {isTelemedicineCheckup && record.appointment && isAuthor && (
                <CheckupTelemedicinePanel
                  appointment={record.appointment}
                  recordId={params.recordId}
                  onAppointmentChange={(appt) =>
                    setRecord((prev) => (prev ? { ...prev, appointment: appt } : prev))
                  }
                />
              )}
              {isTelemedicineCheckup && record.appointment && !isAuthor && (
                <div className="rounded-lg border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
                  Telemedicine session — view only (assigned doctor conducts the video consultation).
                  {record.appointment.patient_joined_at ? (
                    <p className="mt-2 text-xs text-emerald-700">Patient has joined the waiting room</p>
                  ) : null}
                </div>
              )}
              <ConsultationEvidence record={record} />
              <ClinicalNotesReadOnly record={record} />
              <AmendmentsList amendments={record.amendments ?? []} />
            </TabsContent>

            <TabsContent value="prescription" className="mt-0 space-y-3">
              {!record.prescriptions?.length ? (
                <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
                  No prescriptions on this medical record.
                </div>
              ) : (
                record.prescriptions.map((p) => (
                  <Card key={p.id}>
                    <CardContent className="p-4 text-sm">
                      <p className="font-semibold">
                        {p.drug_name} {p.strength ?? p.dosage}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {p.route ? `${p.route} · ` : ''}
                        {p.frequency}
                        {p.duration ? ` · ${p.duration}` : ''}
                        {p.is_prn ? ' · PRN' : ''}
                      </p>
                      {p.instructions && <p className="mt-2">{p.instructions}</p>}
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="referral" className="mt-0 space-y-3">
              {!record.referrals?.length ? (
                <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
                  No referrals on this medical record.
                </div>
              ) : (
                record.referrals.map((r) => (
                  <Card key={r.id}>
                    <CardContent className="space-y-2 p-4 text-sm">
                      <p>
                        Referred to <strong>{r.referred_to}</strong>
                        {r.specialty ? ` (${r.specialty})` : ''}
                      </p>
                      {r.referred_to_institution && (
                        <p className="text-muted-foreground">{r.referred_to_institution}</p>
                      )}
                      <StatusBadge
                        tone={r.urgency === 'URGENT' ? 'danger' : 'info'}
                        label={r.urgency.toLowerCase()}
                      />
                      <p className="whitespace-pre-line">{r.reason}</p>
                      {r.clinical_summary && (
                        <p className="whitespace-pre-line">
                          <span className="font-medium">Summary: </span>
                          {r.clinical_summary}
                        </p>
                      )}
                      {r.specific_questions && (
                        <p className="whitespace-pre-line">
                          <span className="font-medium">Questions: </span>
                          {r.specific_questions}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="notes" className="mt-0">
              <DoctorsNotesTab notes={privateNotes} readOnly doctorName={doctorName} />
            </TabsContent>
          </div>
        </Tabs>
      </AppPage>
    </DashboardLayout>
  );
}
