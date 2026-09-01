'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  superAdminApi,
  type DashboardStats,
  type InquirySummary,
  type PracticeSummary,
} from '@/lib/api/super-admin';
import { useSuperAdminAuth } from '@/lib/super-admin-auth';
import { AppPage } from '@/components/layout/app-page';
import { PageHeader } from '@/components/layout/page-header';
import { MetricCard, MetricGrid } from '@/components/ds/cards';
import { ErrorState } from '@/components/ds/error-state';
import { StatusBadge, type StatusTone } from '@/components/ds/status-badge';
import {
  DesktopOnlyTable,
  MobileDataCard,
  MobileDataList,
} from '@/components/ds/responsive-table';
import { TableSection } from '@/components/ds/table-section';
import {
  DashboardListSkeleton,
  MetricGridSkeleton,
} from '@/components/dashboard/dashboard-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency, formatDate } from '@/lib/format';
import {
  Building2,
  CheckCircle2,
  Clock,
  Ban,
  TrendingUp,
  Plus,
  Inbox,
  Users,
  Stethoscope,
  Mail,
  AlertTriangle,
  CreditCard,
} from 'lucide-react';

function subscriptionTone(status: string): StatusTone {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'TRIAL':
      return 'info';
    case 'SUSPENDED':
    case 'CANCELLED':
      return 'danger';
    default:
      return 'neutral';
  }
}

function inquiryTone(status: string): StatusTone {
  switch (status) {
    case 'NEW':
      return 'primary';
    case 'CONTACTED':
      return 'info';
    case 'DECLINED':
      return 'danger';
    default:
      return 'neutral';
  }
}

const CHART_BAR_CLASS = [
  'bg-[hsl(var(--chart-1))]',
  'bg-[hsl(var(--chart-2))]',
  'bg-[hsl(var(--chart-3))]',
] as const;

export default function SuperAdminDashboardPage() {
  const { token, loading: authLoading } = useSuperAdminAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recent, setRecent] = useState<PracticeSummary[]>([]);
  const [recentInquiries, setRecentInquiries] = useState<InquirySummary[]>([]);
  const [practices, setPractices] = useState<PracticeSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [practicesError, setPracticesError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !token) return;

    let cancelled = false;
    setError(null);
    setPracticesError(null);

    void (async () => {
      const [dashResult, practicesResult] = await Promise.allSettled([
        superAdminApi.dashboard(),
        superAdminApi.listPractices(),
      ]);

      if (cancelled) return;

      if (dashResult.status === 'fulfilled') {
        setStats(dashResult.value.stats);
        setRecent(dashResult.value.recent_signups);
        setRecentInquiries(dashResult.value.recent_inquiries ?? []);
      } else {
        setError(
          dashResult.reason instanceof Error
            ? dashResult.reason.message
            : 'Failed to load dashboard'
        );
      }

      if (practicesResult.status === 'fulfilled') {
        setPractices(practicesResult.value);
      } else {
        setPracticesError("We couldn't load the practice overview.");
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, token]);

  const patientTotal = useMemo(
    () => practices.reduce((sum, p) => sum + (p._count?.patients ?? 0), 0),
    [practices]
  );

  const statusChartData = useMemo(() => {
    if (!stats) return [];
    return [
      { name: 'Active', value: stats.active_practices },
      { name: 'Trial', value: stats.trial_practices },
      { name: 'Suspended', value: stats.suspended_practices },
    ].filter((d) => d.value > 0);
  }, [stats]);

  const statusChartMax = useMemo(
    () => Math.max(1, ...statusChartData.map((d) => d.value)),
    [statusChartData]
  );

  const attentionItems = useMemo(() => {
    if (!stats) return [];
    return [
      {
        label: 'Owner invites pending',
        value: stats.owner_invitations_pending ?? 0,
        href: '/super-admin/support',
        icon: Mail,
      },
      {
        label: 'Trials ending soon',
        value: stats.trials_ending_soon ?? 0,
        href: '/super-admin/support',
        icon: Clock,
      },
      {
        label: 'Awaiting verification',
        value: stats.invoices_awaiting_verification ?? 0,
        href: '/super-admin/billing',
        icon: CreditCard,
      },
      {
        label: 'Overdue invoices',
        value: stats.overdue_invoices ?? 0,
        href: '/super-admin/billing',
        icon: AlertTriangle,
      },
    ].filter((item) => item.value > 0);
  }, [stats]);

  const retry = () => {
    setError(null);
    setPracticesError(null);
    if (!stats) setLoading(true);
    void (async () => {
      const [dashResult, practicesResult] = await Promise.allSettled([
        superAdminApi.dashboard(),
        superAdminApi.listPractices(),
      ]);
      if (dashResult.status === 'fulfilled') {
        setStats(dashResult.value.stats);
        setRecent(dashResult.value.recent_signups);
        setRecentInquiries(dashResult.value.recent_inquiries ?? []);
        setError(null);
      } else {
        setError(
          dashResult.reason instanceof Error
            ? dashResult.reason.message
            : 'Failed to load dashboard'
        );
      }
      if (practicesResult.status === 'fulfilled') {
        setPractices(practicesResult.value);
        setPracticesError(null);
      } else {
        setPracticesError("We couldn't load the practice overview.");
      }
      setLoading(false);
    })();
  };

  return (
    <AppPage>
      <PageHeader
        title="Platform overview"
        description="Health and growth of the MediNathi SaaS platform."
        actions={
          <Button asChild>
            <Link href="/super-admin/practices/new">
              <Plus className="h-4 w-4" />
              Onboard practice
            </Link>
          </Button>
        }
      />

      {error && <ErrorState kind="api" message={error} onRetry={retry} />}

      {loading && !stats ? (
        <MetricGridSkeleton count={4} />
      ) : (
        <MetricGrid>
          <MetricCard
            label="Total practices"
            value={stats?.total_practices ?? '—'}
            icon={<Building2 className="h-5 w-5" />}
            tone="primary"
          />
          <MetricCard
            label="Configured monthly revenue"
            value={
              stats ? formatCurrency(stats.monthly_recurring_revenue_cents) : '—'
            }
            context="Active practice fees"
            icon={<TrendingUp className="h-5 w-5" />}
            tone="info"
          />
          <MetricCard
            label="Doctor seats allocated"
            value={
              stats?.doctor_seats_allocated != null && stats?.doctor_seats_limit != null
                ? `${stats.doctor_seats_allocated}/${stats.doctor_seats_limit}`
                : '—'
            }
            icon={<Stethoscope className="h-5 w-5" />}
            tone="clinical"
          />
          <Link href="/super-admin/inquiries" className="block h-full min-w-0">
            <MetricCard
              label="New inquiries"
              value={stats?.new_inquiries_count ?? '—'}
              icon={<Inbox className="h-5 w-5" />}
              tone="warning"
              className="h-full transition-colors hover:border-primary/30"
            />
          </Link>
        </MetricGrid>
      )}

      {!loading && attentionItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
            <CardDescription>Operational queues requiring Super Admin action</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {attentionItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:border-primary/30"
                >
                  <item.icon className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-semibold tabular-nums">{item.value}</p>
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && stats && (
        <div className="space-y-2">
          <p className="text-caption font-medium text-muted-foreground">Practice status</p>
          <div className="flex flex-wrap gap-3">
            <div className="inline-flex items-center gap-2 rounded-lg border border-success/25 bg-success-soft/50 px-3 py-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <span className="font-medium">Active</span>
              <span className="tabular-nums text-muted-foreground">{stats.active_practices}</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-info/25 bg-info-soft/50 px-3 py-2 text-sm">
              <Clock className="h-4 w-4 text-info" />
              <span className="font-medium">Trial</span>
              <span className="tabular-nums text-muted-foreground">{stats.trial_practices}</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-danger/25 bg-danger-soft/50 px-3 py-2 text-sm">
              <Ban className="h-4 w-4 text-danger" />
              <span className="font-medium">Suspended</span>
              <span className="tabular-nums text-muted-foreground">{stats.suspended_practices}</span>
            </div>
          </div>
        </div>
      )}

      {!loading && !practicesError && practices.length > 0 && (
        <MetricGrid columns="single">
          <MetricCard
            label="Total patients"
            value={patientTotal}
            context="Aggregate counts only — no clinical detail"
            icon={<Users className="h-5 w-5" />}
            tone="default"
          />
        </MetricGrid>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Subscription distribution</CardTitle>
            <CardDescription>Practice counts by subscription status</CardDescription>
          </CardHeader>
          <CardContent>
            {loading && statusChartData.length === 0 ? (
              <DashboardListSkeleton rows={3} />
            ) : statusChartData.length === 0 ? (
              <EmptyState
                title="No practices yet"
                description="Subscription distribution will appear when practices are onboarded."
              />
            ) : (
              <figure className="min-w-0 space-y-4" aria-label="Subscription distribution">
                <ul className="space-y-4">
                  {statusChartData.map((row, i) => {
                    const pct = Math.round((row.value / statusChartMax) * 100);
                    return (
                      <li key={row.name} className="space-y-1.5">
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="font-medium text-foreground">{row.name}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {row.value} practice{row.value === 1 ? '' : 's'}
                          </span>
                        </div>
                        <div
                          className="h-3 w-full overflow-hidden rounded-full bg-muted"
                          role="img"
                          aria-label={`${row.name}: ${row.value}`}
                        >
                          <div
                            className={`h-full rounded-full transition-[width] ${CHART_BAR_CLASS[i % CHART_BAR_CLASS.length]}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </figure>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle>Recent inquiries</CardTitle>
              <CardDescription>Doctor signup requests from the landing page.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/super-admin/inquiries">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {loading && recentInquiries.length === 0 ? (
              <DashboardListSkeleton rows={4} />
            ) : recentInquiries.length === 0 ? (
              <EmptyState
                title="No inquiries yet"
                description="New practice inquiries will appear here."
              />
            ) : (
              <div className="divide-y">
                {recentInquiries.map((inquiry) => (
                  <div
                    key={inquiry.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="break-words font-medium">{inquiry.full_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {inquiry.city} · HPCSA {inquiry.hpcsa_number}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDate(inquiry.created_at)}</p>
                    </div>
                    <StatusBadge tone={inquiryTone(inquiry.status)} label={inquiry.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <TableSection
        title="Practice overview"
        description="Operational tenant summary — no clinical information"
        framed={false}
        action={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/super-admin/practices">Manage practices</Link>
          </Button>
        }
      >
        {loading && practices.length === 0 && !practicesError ? (
          <DashboardListSkeleton rows={5} />
        ) : practicesError ? (
          <ErrorState kind="api" message={practicesError} onRetry={retry} />
        ) : practices.length === 0 ? (
          <EmptyState
            title="No practices during this period"
            description="Onboard the first practice to get started."
            action={
              <Button asChild>
                <Link href="/super-admin/practices/new">Onboard practice</Link>
              </Button>
            }
          />
        ) : (
          <>
            <MobileDataList>
              {practices.slice(0, 12).map((p) => (
                <MobileDataCard key={p.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/super-admin/practices/${p.id}`}
                        className="break-words font-semibold hover:text-primary"
                      >
                        {p.clinic_name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{p.subdomain}</p>
                    </div>
                    <StatusBadge
                      tone={subscriptionTone(p.subscription_status)}
                      label={p.subscription_status}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {p._count?.doctors ?? 0} doctors · {p._count?.patients ?? 0} patients
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(p.monthly_fee_cents)} / mo · Created {formatDate(p.created_at)}
                    {p.trial_ends_at ? ` · Trial ends ${formatDate(p.trial_ends_at)}` : ''}
                  </p>
                </MobileDataCard>
              ))}
            </MobileDataList>

            <DesktopOnlyTable label="Practice overview">
              <TableHeader>
                <TableRow>
                  <TableHead>Practice</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Doctors</TableHead>
                  <TableHead>Patients</TableHead>
                  <TableHead className="table-priority-medium">Monthly fee</TableHead>
                  <TableHead className="table-priority-medium">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {practices.slice(0, 12).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-[200px]">
                      <Link
                        href={`/super-admin/practices/${p.id}`}
                        className="break-words font-medium hover:text-primary"
                      >
                        {p.clinic_name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{p.subdomain}</p>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={subscriptionTone(p.subscription_status)}
                        label={p.subscription_status}
                      />
                    </TableCell>
                    <TableCell>{p._count?.doctors ?? 0}</TableCell>
                    <TableCell>{p._count?.patients ?? 0}</TableCell>
                    <TableCell className="table-priority-medium">
                      {formatCurrency(p.monthly_fee_cents)}
                    </TableCell>
                    <TableCell className="table-priority-medium">
                      {formatDate(p.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </DesktopOnlyTable>
          </>
        )}
      </TableSection>

      {!loading && recent.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent signups</CardTitle>
            <CardDescription>Newest practices on the platform.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {recent.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/super-admin/practices/${p.id}`}
                      className="break-words font-medium hover:text-primary"
                    >
                      {p.clinic_name}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {p.subdomain} · {formatDate(p.created_at)}
                    </p>
                  </div>
                  <StatusBadge
                    tone={subscriptionTone(p.subscription_status)}
                    label={p.subscription_status}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </AppPage>
  );
}
