'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { AppPage } from '@/components/layout/app-page';
import { PageHeader } from '@/components/layout/page-header';
import { ActionCard } from '@/components/ds/cards';
import { StatusBadge } from '@/components/ds/status-badge';
import { ErrorState } from '@/components/ds/error-state';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { AppointmentStatusBadge, AppointmentTypeBadge } from '@/components/shared/badges';
import { DashboardSection } from '@/components/dashboard/dashboard-section';
import { DashboardListSkeleton, HeroSkeleton } from '@/components/dashboard/dashboard-skeleton';
import { appointmentsApi } from '@/lib/api/appointments';
import { paymentsApi, messagesApi } from '@/lib/api/misc';
import { medicalRecordsApi } from '@/lib/api/medical-records';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';
import { usePollingRefresh } from '@/lib/use-polling-refresh';
import { timeOfDayGreeting } from '@/lib/appointments/status';
import type { Appointment, MedicalRecord, Payment } from '@/lib/types';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle,
  CreditCard,
  FileText,
  MessageSquare,
  Video,
} from 'lucide-react';

const DASHBOARD_POLL_MS = 5_000;

export default function PatientDashboard() {
  const { user } = useAuth();
  const [upcoming, setUpcoming] = useState<Appointment[]>([]);
  const [recentRecords, setRecentRecords] = useState<MedicalRecord[]>([]);
  const [unpaid, setUnpaid] = useState<Payment[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [apptsError, setApptsError] = useState<string | null>(null);
  const [recordsError, setRecordsError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.patient?.id) return;
    const now = new Date().toISOString();
    const patientId = user.patient.id;

    const [apptsResult, paymentsResult, recordsResult, unreadResult] = await Promise.allSettled([
      appointmentsApi.list({ patient_id: patientId, gte: now }),
      paymentsApi.list({ patient_id: patientId, status: 'UNPAID' }),
      medicalRecordsApi.list({ patient_id: patientId }),
      messagesApi.unreadCount(),
    ]);

    if (apptsResult.status === 'fulfilled') {
      setUpcoming(apptsResult.value);
      setApptsError(null);
    } else {
      setUpcoming([]);
      setApptsError('We couldn\'t load your appointments.');
    }

    if (paymentsResult.status === 'fulfilled') {
      setUnpaid(paymentsResult.value);
    }

    if (recordsResult.status === 'fulfilled') {
      setRecentRecords(recordsResult.value.slice(0, 5));
      setRecordsError(null);
    } else {
      setRecentRecords([]);
      setRecordsError('We couldn\'t load your health records.');
    }

    if (unreadResult.status === 'fulfilled') {
      setUnreadCount(unreadResult.value.count);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  usePollingRefresh(load, DASHBOARD_POLL_MS, !!user?.patient?.id);

  const nextAppt = upcoming[0] ?? null;
  const firstName = user?.profile?.full_name?.split(' ')[0] ?? 'there';
  const greeting = timeOfDayGreeting();

  return (
      <AppPage>
        <PageHeader
          title={`${greeting}, ${firstName}`}
          description="Your care at a glance"
        />

        <DashboardSection
          title="Your next appointment"
          description="What is coming up for your care"
          priority="primary"
        >
          {loading ? (
            <HeroSkeleton />
          ) : apptsError ? (
            <ErrorState kind="api" message={apptsError} onRetry={() => void load()} />
          ) : !nextAppt ? (
            <EmptyState
              icon={<CalendarDays className="h-10 w-10" />}
              title="You have no upcoming appointments"
              description="Book a visit when you are ready."
              action={
                <Button asChild size="lg" className="min-h-11">
                  <Link href="/patient/book">Book appointment</Link>
                </Button>
              }
            />
          ) : (
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
                  {formatDateTime(nextAppt.scheduled_at)}
                </p>
                <h3 className="text-xl font-semibold tracking-tight text-foreground break-words">
                  {nextAppt.doctor?.profile?.full_name ?? 'Your doctor'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {nextAppt.reason?.trim() || 'Consultation'}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <AppointmentStatusBadge status={nextAppt.status} />
                  <AppointmentTypeBadge type={nextAppt.type} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="lg" className="min-h-11">
                  <Link href="/patient/book">View appointment</Link>
                </Button>
                {nextAppt.type === 'TELEMEDICINE' && (
                  <Button asChild variant="outline" size="lg" className="min-h-11">
                    <Link href="/patient/telemedicine">
                      <Video className="h-4 w-4" />
                      Telemedicine
                    </Link>
                  </Button>
                )}
              </div>
              {upcoming.length > 1 && (
                <p className="text-sm text-muted-foreground">
                  {upcoming.length - 1} more upcoming appointment
                  {upcoming.length - 1 === 1 ? '' : 's'} ·{' '}
                  <Link href="/patient/book" className="font-medium text-primary hover:underline">
                    View all
                  </Link>
                </p>
              )}
            </div>
          )}
        </DashboardSection>

        <div className="grid gap-3 sm:grid-cols-2">
          <Button asChild size="lg" variant="outline" className="min-h-12 justify-start gap-3">
            <Link href="/patient/book">
              <CalendarDays className="h-5 w-5 shrink-0" />
              Book appointment
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="min-h-12 justify-start gap-3">
            <Link href="/patient/records">
              <FileText className="h-5 w-5 shrink-0" />
              Medical records
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="min-h-12 justify-start gap-3">
            <Link href="/patient/messages">
              <MessageSquare className="h-5 w-5 shrink-0" />
              Messages
              {unreadCount > 0 ? ` (${unreadCount})` : ''}
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="min-h-12 justify-start gap-3">
            <Link href="/patient/telemedicine">
              <Video className="h-5 w-5 shrink-0" />
              Telemedicine
            </Link>
          </Button>
        </div>

        {unreadCount > 0 && (
          <ActionCard
            title="You have unread messages"
            description={`${unreadCount} message${unreadCount === 1 ? '' : 's'} waiting for you.`}
            action={
              <Button asChild>
                <Link href="/patient/messages">
                  Open messages
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            }
          />
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <DashboardSection
            title="Recent health records"
            description="Open a record for full details"
            action={
              <Button variant="ghost" size="sm" asChild>
                <Link href="/patient/records">
                  View all <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            }
          >
            {loading ? (
              <DashboardListSkeleton rows={3} />
            ) : recordsError ? (
              <ErrorState kind="api" message={recordsError} onRetry={() => void load()} />
            ) : recentRecords.length === 0 ? (
              <EmptyState
                icon={<FileText className="h-10 w-10" />}
                title="No records yet"
                description="Your consultation records will appear here."
              />
            ) : (
              <div className="space-y-2">
                {recentRecords.map((rec) => (
                  <Link
                    key={rec.id}
                    href={`/patient/records/view/${rec.id}`}
                    className="dashboard-item flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors hover:border-primary/40 hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {formatDate(rec.record_date)}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {rec.doctor?.profile?.full_name ?? 'Your doctor'}
                      </p>
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

          <DashboardSection
            title="Payments"
            description="Outstanding invoices at the clinic"
            action={
              <Button variant="ghost" size="sm" asChild>
                <Link href="/patient/payments">
                  View all <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            }
          >
            {loading ? (
              <DashboardListSkeleton rows={2} />
            ) : unpaid.length === 0 ? (
              <EmptyState
                icon={<CheckCircle className="h-10 w-10" />}
                title="All settled"
                description="You have no outstanding invoices."
              />
            ) : (
              <div className="space-y-2">
                {unpaid.map((pay) => (
                  <div
                    key={pay.id}
                    className="dashboard-item flex items-center justify-between gap-3 rounded-xl border p-3"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-muted-foreground">{pay.invoice_number}</p>
                      <p className="text-sm text-muted-foreground">{formatDate(pay.created_at)}</p>
                    </div>
                    <p className="shrink-0 font-semibold tabular-nums text-foreground">
                      {formatCurrency(pay.amount_cents)}
                    </p>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Payments are made at the clinic (cash, EFT, card, or medical aid).
                </p>
              </div>
            )}
          </DashboardSection>
        </div>
      </AppPage>
  );
}
