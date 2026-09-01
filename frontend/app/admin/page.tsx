'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { AppPage } from '@/components/layout/app-page';
import { PageHeader } from '@/components/layout/page-header';
import { MetricCard, MetricGrid } from '@/components/ds/cards';
import { ErrorState } from '@/components/ds/error-state';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { DashboardSection } from '@/components/dashboard/dashboard-section';
import {
  DashboardListSkeleton,
  MetricGridSkeleton,
} from '@/components/dashboard/dashboard-skeleton';
import { ScheduleRow } from '@/components/dashboard/schedule-row';
import { dashboardApi, paymentsApi } from '@/lib/api/misc';
import { appointmentsApi } from '@/lib/api/appointments';
import { todayBounds } from '@/lib/appointments/day-bounds';
import {
  countByStatus,
  isActiveConsult,
  isCancelledLike,
  isCompleted,
  isWaitingRoom,
  sortByScheduledAt,
  timeOfDayGreeting,
} from '@/lib/appointments/status';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Appointment, Payment } from '@/lib/types';
import {
  ArrowRight,
  CalendarDays,
  CreditCard,
  Plus,
  Search,
  Users,
  Clock,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { receptionAppointmentLabel } from '@/lib/appointments/reception-labels';

export default function AdminDashboard() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patientCount, setPatientCount] = useState(0);
  const [unpaid, setUnpaid] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [apptsError, setApptsError] = useState<string | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setApptsError(null);
    setStatsError(null);
    const { from, to } = todayBounds();

    const [statsResult, unpaidResult, apptsResult] = await Promise.allSettled([
      dashboardApi.adminStats(),
      paymentsApi.list({ status: 'UNPAID' }),
      appointmentsApi.list({ from, to }),
    ]);

    if (statsResult.status === 'fulfilled') {
      setPatientCount(statsResult.value.patients);
    } else {
      setStatsError('We couldn\'t load practice totals.');
    }

    if (unpaidResult.status === 'fulfilled') {
      setUnpaid(unpaidResult.value);
    }

    if (apptsResult.status === 'fulfilled') {
      setAppointments([...apptsResult.value].sort(sortByScheduledAt));
    } else {
      setAppointments([]);
      setApptsError('We couldn\'t load today\'s appointments.');
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const waiting = useMemo(() => appointments.filter((a) => isWaitingRoom(a.status)), [appointments]);
  const inConsult = useMemo(
    () => appointments.filter((a) => isActiveConsult(a.status)),
    [appointments]
  );
  const completed = useMemo(
    () => appointments.filter((a) => isCompleted(a.status)),
    [appointments]
  );
  const cancelledCount = countByStatus(appointments, isCancelledLike);
  const unpaidAmount = unpaid.reduce((sum, p) => sum + p.amount_cents, 0);

  const now = new Date();
  const upcoming = useMemo(
    () =>
      appointments.filter((a) => {
        if (isCompleted(a.status) || isCancelledLike(a.status) || isActiveConsult(a.status)) {
          return false;
        }
        return new Date(a.scheduled_at).getTime() >= now.getTime() || isWaitingRoom(a.status);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh with appointments only
    [appointments]
  );

  const firstName = user?.profile?.full_name?.split(' ')[0] ?? 'there';
  const greeting = timeOfDayGreeting();

  return (
    <AppPage>
        <PageHeader
          title={`${greeting}, ${firstName}`}
          description={`Practice operations · ${formatDate(new Date(), true)}`}
        />

        {loading ? (
          <MetricGridSkeleton count={5} columns="reception" />
        ) : (
          <MetricGrid columns="reception">
            <MetricCard
              label="Appointments today"
              value={appointments.length}
              icon={<CalendarDays className="h-5 w-5" />}
              tone="primary"
            />
            <MetricCard
              label="Waiting"
              value={waiting.length}
              icon={<Clock className="h-5 w-5" />}
              tone="warning"
            />
            <MetricCard
              label="Completed"
              value={completed.length}
              icon={<CheckCircle className="h-5 w-5" />}
              tone="success"
            />
            <MetricCard
              label="Cancelled / no-show"
              value={cancelledCount}
              icon={<XCircle className="h-5 w-5" />}
              tone="danger"
            />
            <MetricCard
              label="Unpaid invoices"
              value={unpaid.length}
              context={unpaidAmount > 0 ? formatCurrency(unpaidAmount) : undefined}
              icon={<CreditCard className="h-5 w-5" />}
              tone="info"
            />
          </MetricGrid>
        )}

        {statsError && (
          <ErrorState kind="api" message={statsError} onRetry={() => void load()} />
        )}

        <div className="grid min-w-0 grid-cols-1 gap-2 sm:flex sm:flex-wrap">
          <Button asChild className="w-full min-w-0 sm:w-auto">
            <Link href="/admin/appointments">
              <Plus className="h-4 w-4" />
              Book appointment
            </Link>
          </Button>
          <Button variant="outline" asChild className="w-full min-w-0 sm:w-auto">
            <Link href="/admin/patients">
              <Users className="h-4 w-4" />
              Add patient
            </Link>
          </Button>
          <Button variant="outline" asChild className="w-full min-w-0 sm:w-auto">
            <Link href="/admin/patients">
              <Search className="h-4 w-4" />
              Search patient
            </Link>
          </Button>
          <Button variant="ghost" asChild className="w-full min-w-0 sm:w-auto">
            <Link href="/admin/payments">
              <CreditCard className="h-4 w-4" />
              Payments
            </Link>
          </Button>
        </div>

        <DashboardSection
          title="Appointment queue"
          description="Today's schedule — operational details only"
          priority="primary"
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/appointments">
                Calendar <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          }
        >
          {loading ? (
            <DashboardListSkeleton rows={6} />
          ) : apptsError ? (
            <ErrorState kind="api" message={apptsError} onRetry={() => void load()} />
          ) : appointments.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="h-10 w-10" />}
              title="No appointments today"
              description="There are no appointments scheduled for today."
              action={
                <Button asChild>
                  <Link href="/admin/appointments">Book appointment</Link>
                </Button>
              }
            />
          ) : (
            <div className="space-y-2">
              {appointments.map((appt) => {
                const label = receptionAppointmentLabel(appt);
                return (
                  <ScheduleRow
                    key={appt.id}
                    appointment={appt}
                    primary={label.patient}
                    secondary={`${label.doctor}${label.reason ? ` · ${label.reason}` : ''}`}
                    href="/admin/appointments"
                  />
                );
              })}
            </div>
          )}
        </DashboardSection>

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <DashboardSection
              className="h-full"
              title="Patient flow"
              description="Where patients are right now"
            >
              {loading ? (
                <DashboardListSkeleton rows={3} />
              ) : apptsError ? (
                <ErrorState kind="api" message={apptsError} onRetry={() => void load()} />
              ) : (
                <div className="space-y-4">
                  <FlowGroup title="Waiting" count={waiting.length} empty="No patients are currently waiting.">
                    {waiting.map((a) => (
                      <FlowItem key={a.id} appt={a} />
                    ))}
                  </FlowGroup>
                  <FlowGroup
                    title="In consultation"
                    count={inConsult.length}
                    empty="No consultations in progress."
                  >
                    {inConsult.map((a) => (
                      <FlowItem key={a.id} appt={a} />
                    ))}
                  </FlowGroup>
                  <FlowGroup title="Completed" count={completed.length} empty="No completed visits yet.">
                    {completed.slice(0, 5).map((a) => (
                      <FlowItem key={a.id} appt={a} />
                    ))}
                  </FlowGroup>
                </div>
              )}
            </DashboardSection>

            {!loading && (
              <p className="text-caption px-1 text-muted-foreground">
                Active patients on roster: {patientCount}
              </p>
            )}
          </div>

          <DashboardSection
            className="h-full"
            title="Upcoming today"
            description="Remaining appointments"
            action={
              <Button variant="ghost" size="sm" asChild>
                <Link href="/admin/appointments">
                  Open calendar <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            }
          >
            {loading ? (
              <DashboardListSkeleton rows={3} />
            ) : upcoming.length === 0 ? (
              <EmptyState
                icon={<CheckCircle className="h-10 w-10" />}
                title="No upcoming appointments"
                description="The rest of today's schedule is clear."
              />
            ) : (
              <div className="space-y-2">
                {upcoming.slice(0, 8).map((appt) => {
                  const label = receptionAppointmentLabel(appt);
                  return (
                    <ScheduleRow
                      key={appt.id}
                      appointment={appt}
                      primary={label.patient}
                      secondary={label.doctor}
                      href="/admin/appointments"
                      showType={false}
                    />
                  );
                })}
              </div>
            )}
          </DashboardSection>
        </div>
    </AppPage>
  );
}

function FlowGroup({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="text-caption tabular-nums text-muted-foreground">{count}</span>
      </div>
      {count === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2">{children}</ul>
      )}
    </div>
  );
}

function FlowItem({ appt }: { appt: Appointment }) {
  const label = receptionAppointmentLabel(appt);
  return (
    <li className="rounded-lg border border-border/70 px-3 py-2">
      <p className="truncate text-sm font-medium text-foreground">{label.patient}</p>
      <p className="truncate text-xs text-muted-foreground">{label.doctor}</p>
    </li>
  );
}
