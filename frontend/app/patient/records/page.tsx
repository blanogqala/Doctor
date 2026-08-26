'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { DashboardLayout } from '@/components/shared/dashboard-layout';
import { AppPage } from '@/components/layout/app-page';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/ds/error-state';
import { ClinicalTimeline } from '@/components/records/clinical-timeline';
import { PatientFolderSkeleton } from '@/components/records/patient-folder-skeleton';
import { PatientFolderSectionNav } from '@/components/records/patient-folder-section-nav';
import { RecordStatusBadge } from '@/components/records/record-status';
import { StatusBadge } from '@/components/ds/status-badge';
import { useToast } from '@/hooks/use-toast';
import { medicalRecordsApi } from '@/lib/api/medical-records';
import { formatDate } from '@/lib/format';
import {
  buildConsultationTree,
  buildPatientFacingTimeline,
  doctorDisplayName,
  flattenPrescriptions,
  flattenReferrals,
  recordComplaintSummary,
  type ClinicalTimelineEvent,
} from '@/lib/clinical/patient-folder';
import type { MedicalRecord } from '@/lib/types';
import {
  Download,
  FileText,
  Pill,
  ShieldCheck,
  ArrowRightLeft,
} from 'lucide-react';

const PATIENT_RECORD_SECTIONS = [
  { id: 'consultations', label: 'Consultations' },
  { id: 'prescriptions', label: 'Prescriptions' },
  { id: 'referrals', label: 'Referrals' },
  { id: 'timeline', label: 'Timeline' },
] as const;

export default function PatientRecordsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState('consultations');

  const load = useCallback(async () => {
    if (!user?.patient?.id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await medicalRecordsApi.list({ patient_id: user.patient.id });
      setRecords(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load records');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const consultationTree = useMemo(() => buildConsultationTree(records), [records]);
  const timeline = useMemo(() => buildPatientFacingTimeline(records), [records]);
  const prescriptions = useMemo(() => flattenPrescriptions(records), [records]);
  const referrals = useMemo(() => flattenReferrals(records), [records]);

  const openRecord = (id: string) => {
    router.push(`/patient/records/view/${id}`);
  };

  const onTimelineOpen = (event: ClinicalTimelineEvent) => {
    if (event.recordId) openRecord(event.recordId);
  };

  const handleExport = () => {
    const exportData = records.map((r) => ({
      date: r.record_date,
      doctor: r.doctor?.profile?.full_name ?? 'Unknown',
      subjective: r.subjective,
      objective: r.objective,
      assessment: r.assessment,
      plan: r.plan,
      diagnosis_codes: r.diagnosis_codes,
      prescriptions:
        r.prescriptions?.map((p) => `${p.drug_name} ${p.dosage} ${p.frequency}`) ?? [],
    }));
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `my-medical-records-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: 'Records exported',
      description: 'Your data has been downloaded (right of access)',
    });
  };

  return (
    <DashboardLayout>
      <AppPage>
        <PageHeader
          title="My Medical Records"
          description="Your consultations, prescriptions, and referrals in one place."
          actions={
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={records.length === 0}
              className="min-h-11"
            >
              <Download className="mr-2 h-4 w-4" />
              Export My Data
            </Button>
          }
        />

        {/* <div className="flex items-start gap-2 rounded-lg border border-secondary/30 bg-secondary/5 p-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-secondary" />
          <p className="text-sm text-foreground">
            Doctor-private notes and AI consultation transcripts are not shown here. You can
            export the clinical content available to you.
          </p>
        </div> */}

        {loading ? (
          <PatientFolderSkeleton />
        ) : error ? (
          <ErrorState title="Could not load your records" message={error} onRetry={load} />
        ) : records.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-10 w-10" />}
            title="No medical records are available yet"
            description="Your consultation notes will appear here after your first appointment."
          />
        ) : (
          <Tabs value={tab} onValueChange={setTab} className="min-w-0">
            <PatientFolderSectionNav sections={PATIENT_RECORD_SECTIONS} />

            <TabsContent value="consultations" className="mt-4 space-y-4">
              {consultationTree.map(({ parent, followUps }) => (
                <div key={parent.id} className="space-y-2">
                  <button
                    type="button"
                    onClick={() => openRecord(parent.id)}
                    className="w-full rounded-lg border border-border bg-card p-4 text-left shadow-sm transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground">
                        Consultation · {formatDate(parent.record_date, true)}
                      </p>
                      {parent.is_draft ? (
                        <StatusBadge tone="info" label="Scheduled" />
                      ) : (
                        <RecordStatusBadge record={parent} />
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      with {doctorDisplayName(parent.doctor?.profile?.full_name)}
                    </p>
                    {!parent.is_draft && (
                      <p className="mt-2 line-clamp-2 text-sm text-foreground">
                        {recordComplaintSummary(parent)}
                      </p>
                    )}
                    <span className="mt-3 inline-block text-sm font-medium text-primary">
                      View
                    </span>
                  </button>

                  {followUps.length > 0 && (
                    <div className="ml-3 space-y-2 border-l-2 border-primary/40 pl-3 sm:ml-5">
                      {followUps.map((child) => (
                        <button
                          key={child.id}
                          type="button"
                          onClick={() => openRecord(child.id)}
                          className="w-full rounded-lg border border-border bg-card p-3 text-left shadow-sm transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium">
                              Follow-up · {formatDate(child.record_date, true)}
                            </p>
                            {child.is_draft ? (
                              <StatusBadge tone="info" label="Upcoming" />
                            ) : (
                              <RecordStatusBadge record={child} />
                            )}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            with {doctorDisplayName(child.doctor?.profile?.full_name)}
                          </p>
                          {child.is_draft && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Notes will appear after your visit
                            </p>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </TabsContent>

            <TabsContent value="timeline" className="mt-4">
              <ClinicalTimeline
                events={timeline}
                onOpen={onTimelineOpen}
                empty={
                  <EmptyState
                    icon={<FileText className="h-10 w-10" />}
                    title="No medical records are available yet"
                    description="Your timeline will fill in after consultations."
                  />
                }
              />
            </TabsContent>


            <TabsContent value="prescriptions" className="mt-4 space-y-3">
              {prescriptions.length === 0 ? (
                <EmptyState
                  icon={<Pill className="h-10 w-10" />}
                  title="No prescriptions available"
                  description="Prescriptions from your consultations will appear here."
                />
              ) : (
                prescriptions.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => openRecord(p.medical_record_id)}
                    className="w-full rounded-lg border border-border bg-card p-4 text-left shadow-sm hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <p className="font-semibold">
                      {p.drug_name} {p.dosage}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {p.frequency}
                      {p.duration ? ` · ${p.duration}` : ''}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatDate(p.created_at)} · View
                    </p>
                  </button>
                ))
              )}
            </TabsContent>

            <TabsContent value="referrals" className="mt-4 space-y-3">
              {referrals.length === 0 ? (
                <EmptyState
                  icon={<ArrowRightLeft className="h-10 w-10" />}
                  title="No referrals available"
                  description="Referrals from your consultations will appear here."
                />
              ) : (
                referrals.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() =>
                      r.medical_record_id ? openRecord(r.medical_record_id) : undefined
                    }
                    className="w-full rounded-lg border border-border bg-card p-4 text-left shadow-sm hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <p className="font-semibold">{r.specialty || r.referred_to}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.reason}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatDate(r.created_at)} · View
                    </p>
                  </button>
                ))
              )}
            </TabsContent>
          </Tabs>
          
        )}
      </AppPage>
    </DashboardLayout>
  );
}
