'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { DashboardLayout } from '@/components/shared/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { RecordViewChrome } from '@/components/records/record-view-chrome';
import { RecordSubTabs } from '@/components/records/record-sub-tabs';
import { ClinicalNotesReadOnly } from '@/components/records/clinical-notes-readonly';
import { AmendmentsList } from '@/components/records/amendments-list';
import { RecordStatusBadge } from '@/components/records/record-status';
import { ClinicalRecordSkeleton } from '@/components/records/patient-folder-skeleton';
import { AppPage } from '@/components/layout/app-page';
import { useToast } from '@/hooks/use-toast';
import { medicalRecordsApi } from '@/lib/api/medical-records';
import { formatDate } from '@/lib/format';
import { doctorDisplayName } from '@/lib/clinical/patient-folder';
import type { MedicalRecord } from '@/lib/types';
import { AlertTriangle, X } from 'lucide-react';

export default function PatientRecordViewPage() {
  const params = useParams<{ recordId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [record, setRecord] = useState<MedicalRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('clinical');

  const listHref = '/patient/records';

  const load = useCallback(async () => {
    try {
      const data = await medicalRecordsApi.getById(params.recordId);
      if (user?.patient?.id && data.patient_id !== user.patient.id) {
        toast({
          title: 'Access denied',
          description: 'You can only view your own records.',
          variant: 'destructive',
        });
        router.replace(listHref);
        return;
      }
      setRecord(data);
    } catch (err) {
      toast({
        title: 'Failed to load record',
        description: err instanceof Error ? err.message : 'Not found',
        variant: 'destructive',
      });
      router.replace(listHref);
    } finally {
      setLoading(false);
    }
  }, [params.recordId, user?.patient?.id, toast, router]);

  useEffect(() => {
    load();
  }, [load]);

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
        <div className="py-12 text-center">
          <p className="text-muted-foreground">Record not found.</p>
          <Button variant="outline" onClick={() => router.push(listHref)} className="mt-4">
            Back to My Records
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const doctorName = record.doctor?.profile?.full_name ?? 'Unknown Doctor';
  const doctorLabel = doctorDisplayName(doctorName);
  const isFollowUp = Boolean(record.parent_record_id);

  return (
    <DashboardLayout>
      <AppPage>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <RecordViewChrome
            title={doctorLabel}
            subtitle={formatDate(record.record_date, true)}
            actions={
              <Button onClick={() => router.push(listHref)}>
                <X className="mr-2 h-4 w-4" /> Close
              </Button>
            }
            tabs={<RecordSubTabs variant="patient" sticky={false} />}
          />

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {record.is_draft ? (
              <Badge variant="secondary">Upcoming</Badge>
            ) : (
              <RecordStatusBadge record={record} amended={(record.amendments?.length ?? 0) > 0} />
            )}
            {record.is_erroneous && (
              <Badge variant="destructive">
                <AlertTriangle className="mr-1 h-3 w-3" /> Erroneous
              </Badge>
            )}
          </div>

          {isFollowUp && (
            <p className="mt-2 text-sm text-muted-foreground">
              Follow-up visit linked to an earlier consultation.
            </p>
          )}

          <div className="mt-4 space-y-4">
            <TabsContent value="clinical" className="mt-0 space-y-4">
              <ClinicalNotesReadOnly record={record} />
              <AmendmentsList amendments={record.amendments ?? []} />
            </TabsContent>

            <TabsContent value="prescription" className="mt-0 space-y-3">
              {!record.prescriptions?.length ? (
                <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
                  No prescriptions on this record.
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
                  No referrals on this record.
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
                      <Badge variant="secondary">{r.urgency}</Badge>
                      <p className="whitespace-pre-line">{r.reason}</p>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </div>
        </Tabs>
      </AppPage>
    </DashboardLayout>
  );
}
