'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { superAdminApi, type SubscriptionInvoice } from '@/lib/api/super-admin';
import { AppPage } from '@/components/layout/app-page';
import { PageHeader } from '@/components/layout/page-header';
import { MetricCard, MetricGrid } from '@/components/ds/cards';
import { StatusBadge, type StatusTone } from '@/components/ds/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TableSection } from '@/components/ds/table-section';
import { formatCurrency, formatDate } from '@/lib/format';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

function invoiceTone(status: string): StatusTone {
  switch (status) {
    case 'PAID':
      return 'success';
    case 'PAYMENT_REPORTED':
      return 'warning';
    case 'OVERDUE':
      return 'danger';
    case 'DUE':
      return 'info';
    default:
      return 'neutral';
  }
}

export default function SuperAdminBillingPage() {
  const [metrics, setMetrics] = useState<{
    configured_monthly_revenue_cents: number;
    paid_this_month_cents: number;
    outstanding_cents: number;
    overdue_cents: number;
  } | null>(null);
  const [verificationQueue, setVerificationQueue] = useState<SubscriptionInvoice[]>([]);
  const [invoices, setInvoices] = useState<SubscriptionInvoice[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await superAdminApi.billing({
        ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
      });
      setMetrics(data.metrics);
      setVerificationQueue(data.verification_queue);
      setInvoices(data.invoices);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load billing');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const generateInvoices = async () => {
    setGenerating(true);
    try {
      const result = await superAdminApi.generateInvoices();
      toast.success(`Created ${result.created_count} invoice(s), skipped ${result.skipped_count}`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const verify = async (id: string) => {
    setActingId(id);
    try {
      await superAdminApi.verifyInvoice(id);
      toast.success('Payment verified');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verify failed');
    } finally {
      setActingId(null);
    }
  };

  return (
    <AppPage>
      <PageHeader
        title="Billing"
        description="SaaS subscription invoices and EFT verification — not patient payments."
        actions={
          <Button variant="outline" disabled={generating} onClick={generateInvoices}>
            {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Generate period invoices
          </Button>
        }
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading && !metrics ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : metrics ? (
        <MetricGrid>
          <MetricCard
            label="Configured monthly revenue"
            value={formatCurrency(metrics.configured_monthly_revenue_cents)}
            tone="info"
          />
          <MetricCard
            label="Paid this month"
            value={formatCurrency(metrics.paid_this_month_cents)}
            tone="success"
          />
          <MetricCard
            label="Outstanding"
            value={formatCurrency(metrics.outstanding_cents)}
            tone="warning"
          />
          <MetricCard
            label="Overdue"
            value={formatCurrency(metrics.overdue_cents)}
            tone="danger"
          />
        </MetricGrid>
      ) : null}

      {verificationQueue.length > 0 && (
        <TableSection
          title="Verification queue"
          description="Owner-reported EFT payments awaiting Super Admin confirmation"
        >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Practice</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {verificationQueue.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      {inv.practice ? (
                        <Link
                          href={`/super-admin/practices/${inv.practice.id}`}
                          className="font-medium hover:text-primary"
                        >
                          {inv.practice.clinic_name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>{inv.invoice_number}</TableCell>
                    <TableCell>{formatCurrency(inv.amount_cents)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {inv.payment_reference ?? '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" disabled={actingId === inv.id} onClick={() => verify(inv.id)}>
                        {actingId === inv.id && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                        Verify
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
        </TableSection>
      )}

      <TableSection
        title="All invoices"
        description={loading ? 'Loading…' : `${invoices.length} invoice(s)`}
        action={
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Search practice or invoice…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-56"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="DUE">Due</SelectItem>
                <SelectItem value="PAYMENT_REPORTED">Payment reported</SelectItem>
                <SelectItem value="PAID">Paid</SelectItem>
                <SelectItem value="OVERDUE">Overdue</SelectItem>
                <SelectItem value="VOID">Void</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      >
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices match your filters.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Practice</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      {inv.practice ? (
                        <Link
                          href={`/super-admin/practices/${inv.practice.id}`}
                          className="font-medium hover:text-primary"
                        >
                          {inv.practice.clinic_name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>{inv.invoice_number}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(inv.period_start)} – {formatDate(inv.period_end)}
                    </TableCell>
                    <TableCell>{formatCurrency(inv.amount_cents)}</TableCell>
                    <TableCell>
                      <StatusBadge tone={invoiceTone(inv.status)} label={inv.status} />
                    </TableCell>
                    <TableCell>{formatDate(inv.due_at)}</TableCell>
                    <TableCell className="text-right">
                      {inv.status === 'PAYMENT_REPORTED' && (
                        <Button size="sm" disabled={actingId === inv.id} onClick={() => verify(inv.id)}>
                          Verify
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
      </TableSection>
    </AppPage>
  );
}
