'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { AppPage } from '@/components/layout/app-page';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/ds/error-state';
import { ClinicalTimeline } from '@/components/records/clinical-timeline';
import { ConsultationCard } from '@/components/records/consultation-card';
import { PatientFolderSkeleton } from '@/components/records/patient-folder-skeleton';
import { PatientFolderSectionNav } from '@/components/records/patient-folder-section-nav';
import { useToast } from '@/hooks/use-toast';
import { medicalRecordsApi } from '@/lib/api/medical-records';
import {
  buildConsultationTree,
  buildPatientFacingTimeline,
  type ClinicalTimelineEvent,
} from '@/lib/clinical/patient-folder';
import type { MedicalRecord } from '@/lib/types';
import {
  Download,
  FileText,
} from 'lucide-react';

const PATIENT_RECORD_SECTIONS = [
  { id: 'consultations', label: 'Consultations' },
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
      <AppPage>
        <PageHeader
          title="My Medical Records"
          description="Your consultations and clinical timeline in one place."
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
                  <ConsultationCard
                    record={parent}
                    onOpen={() => openRecord(parent.id)}
                  />
                  {followUps.length > 0 && (
                    <div className="ml-3 space-y-2 border-l-2 border-primary/40 pl-3 sm:ml-5">
                      <p className="text-xs font-medium text-muted-foreground">Follow-ups</p>
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
          </Tabs>
          
        )}
      </AppPage>
  );
}
