'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  superAdminApi,
  type PracticeSummary,
} from '@/lib/api/super-admin';
import { planLabel } from '@/lib/subscription-plans';
import { OnboardingChecklistView } from '@/components/super-admin/onboarding-checklist';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DesktopOnlyTable,
  MobileDataCard,
  MobileDataList,
} from '@/components/ds/responsive-table';
import { TableSection } from '@/components/ds/table-section';
import { StatusBadge, type StatusTone } from '@/components/ds/status-badge';
import { AppPage } from '@/components/layout/app-page';
import { PageHeader } from '@/components/layout/page-header';
import { formatCurrency, formatDate } from '@/lib/format';
import { ExternalLink, Plus } from 'lucide-react';

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

function seatLabel(p: PracticeSummary) {
  if (p.seats) return `${p.seats.allocated}/${p.seats.limit}`;
  const doctors = p._count?.doctors ?? 0;
  const limit = p.doctor_seat_limit ?? doctors;
  return `${doctors}/${limit}`;
}

export default function SuperAdminPracticesPage() {
  const [practices, setPractices] = useState<PracticeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const list = await superAdminApi.listPractices();
      setPractices(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load practices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (id: string, subscription_status: string) => {
    setActingId(id);
    try {
      await superAdminApi.updatePractice(id, { subscription_status });
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setActingId(null);
    }
  };

  const actionsFor = (p: PracticeSummary) => {
    const busy = actingId === p.id;
    const isActive = p.subscription_status === 'ACTIVE';
    const isSuspended = p.subscription_status === 'SUSPENDED';
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" asChild className="min-h-10">
          <Link href={`/super-admin/practices/${p.id}`}>
            <ExternalLink className="mr-1 h-3 w-3" />
            Workspace
          </Link>
        </Button>
        {!isActive && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            loading={busy}
            className="min-h-10"
            onClick={() => setStatus(p.id, 'ACTIVE')}
          >
            Activate
          </Button>
        )}
        {!isSuspended && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            className="min-h-10"
            onClick={() => setStatus(p.id, 'SUSPENDED')}
          >
            Suspend
          </Button>
        )}
      </div>
    );
  };

  return (
    <AppPage>
      <PageHeader
        title="Practices"
        description="Activate, suspend, and review tenants."
        actions={
          <Button asChild>
            <Link href="/super-admin/practices/new">
              <Plus className="h-4 w-4" />
              Onboard
            </Link>
          </Button>
        }
      />

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      <TableSection
        title="All practices"
        description={
          loading && practices.length === 0
            ? 'Loading…'
            : `${practices.length} practice${practices.length === 1 ? '' : 's'}${loading ? ' · Refreshing…' : ''}`
        }
        framed={false}
      >
          {loading && practices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : practices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No practices yet.</p>
          ) : (
            <div className="min-w-0 space-y-4">
              <MobileDataList>
                {practices.map((p) => (
                  <MobileDataCard key={p.id} actions={actionsFor(p)}>
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
                      {planLabel(p.subscription_plan)} · Seats {seatLabel(p)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Owner: {p.owner?.full_name ?? '—'}
                    </p>
                    {p.onboarding && (
                      <div className="mt-2">
                        <OnboardingChecklistView checklist={p.onboarding} />
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(p.monthly_fee_cents)} / mo · {formatDate(p.created_at)}
                    </p>
                  </MobileDataCard>
                ))}
              </MobileDataList>

              <DesktopOnlyTable label="Practices">
                <TableHeader>
                  <TableRow>
                    <TableHead>Clinic</TableHead>
                    <TableHead className="table-priority-medium">Plan</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Seats</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="table-priority-low">Monthly fee</TableHead>
                    <TableHead className="table-priority-medium">Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {practices.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="max-w-[12rem] sm:max-w-none">
                        <Link
                          href={`/super-admin/practices/${p.id}`}
                          className="break-words font-medium hover:text-primary"
                        >
                          {p.clinic_name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{p.subdomain}</p>
                      </TableCell>
                      <TableCell className="table-priority-medium">{planLabel(p.subscription_plan)}</TableCell>
                      <TableCell>
                        {p.owner ? (
                          <div>
                            <p className="text-sm">{p.owner.full_name}</p>
                            <p className="text-xs text-muted-foreground">{p.owner.email}</p>
                          </div>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>{seatLabel(p)}</TableCell>
                      <TableCell>
                        <StatusBadge
                          tone={subscriptionTone(p.subscription_status)}
                          label={p.subscription_status}
                        />
                      </TableCell>
                      <TableCell className="table-priority-low">
                        {formatCurrency(p.monthly_fee_cents)}
                      </TableCell>
                      <TableCell className="table-priority-medium">
                        {formatDate(p.created_at)}
                      </TableCell>
                      <TableCell className="text-right">{actionsFor(p)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </DesktopOnlyTable>
            </div>
          )}
      </TableSection>
    </AppPage>
  );
}
