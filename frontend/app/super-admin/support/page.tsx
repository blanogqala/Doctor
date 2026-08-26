'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { superAdminApi, type SupportQueue } from '@/lib/api/super-admin';
import { Card, CardContent } from '@/components/ui/card';
import { TableSection } from '@/components/ds/table-section';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatusBadge, type StatusTone } from '@/components/ds/status-badge';
import { AppPage } from '@/components/layout/app-page';
import { PageHeader } from '@/components/layout/page-header';
import { formatCurrency, formatDate } from '@/lib/format';

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

function QueueSection({
  title,
  description,
  empty,
  children,
}: {
  title: string;
  description: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  if (empty) return null;
  return (
    <TableSection title={title} description={description}>
      {children}
    </TableSection>
  );
}

export default function SuperAdminSupportPage() {
  const [queue, setQueue] = useState<SupportQueue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    superAdminApi
      .support()
      .then(setQueue)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const totalItems = queue
    ? queue.trial_ending.length +
      queue.overdue_invoices.length +
      queue.payment_reported.length +
      queue.expired_owner_invites.length +
      queue.unactivated_owners.length +
      queue.suspended.length
    : 0;

  return (
    <AppPage>
      <PageHeader
        title="Support"
        description="Operational attention queues — trials, billing, invitations, and suspensions."
      />

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !queue ? null : totalItems === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nothing needs attention right now.
            {queue.generated_at && (
              <p className="mt-2 text-xs">Snapshot: {formatDate(queue.generated_at, true)}</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Generated {formatDate(queue.generated_at, true)} · {totalItems} item(s)
          </p>

          <QueueSection
            title="Trials ending within 7 days"
            description="Practices approaching trial expiry"
            empty={queue.trial_ending.length === 0}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Practice</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Trial ends</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.trial_ending.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/super-admin/practices/${p.id}`} className="font-medium hover:text-primary">
                        {p.clinic_name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={subscriptionTone(p.subscription_status)} label={p.subscription_status} />
                    </TableCell>
                    <TableCell>{p.trial_ends_at ? formatDate(p.trial_ends_at) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </QueueSection>

          <QueueSection
            title="Overdue invoices"
            description="Subscription invoices past due date"
            empty={queue.overdue_invoices.length === 0}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Practice</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.overdue_invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <Link
                        href={`/super-admin/practices/${inv.practice.id}`}
                        className="font-medium hover:text-primary"
                      >
                        {inv.practice.clinic_name}
                      </Link>
                    </TableCell>
                    <TableCell>{inv.invoice_number}</TableCell>
                    <TableCell>{formatCurrency(inv.amount_cents)}</TableCell>
                    <TableCell>{formatDate(inv.due_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </QueueSection>

          <QueueSection
            title="Payments awaiting verification"
            description="Owner-reported EFT — verify in Billing or Practice workspace"
            empty={queue.payment_reported.length === 0}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Practice</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.payment_reported.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <Link
                        href={`/super-admin/practices/${inv.practice.id}`}
                        className="font-medium hover:text-primary"
                      >
                        {inv.practice.clinic_name}
                      </Link>
                    </TableCell>
                    <TableCell>{inv.invoice_number}</TableCell>
                    <TableCell>{inv.payment_reference ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </QueueSection>

          <QueueSection
            title="Expired owner invitations"
            description="Owner never activated — resend from Practice workspace"
            empty={queue.expired_owner_invites.length === 0}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invitee</TableHead>
                  <TableHead>Practice</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.expired_owner_invites.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      {inv.full_name}
                      <p className="text-xs text-muted-foreground">{inv.email}</p>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/super-admin/practices/${inv.practice.id}`}
                        className="hover:text-primary"
                      >
                        {inv.practice.clinic_name}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </QueueSection>

          <QueueSection
            title="Unactivated owners"
            description="Practice exists but owner has not activated — invitee details from pending Owner invitation"
            empty={queue.unactivated_owners.length === 0}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Practice</TableHead>
                  <TableHead>Owner invitee</TableHead>
                  <TableHead>Invitation</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Expires</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.unactivated_owners.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/super-admin/practices/${p.id}`} className="font-medium hover:text-primary">
                        {p.clinic_name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {p.owner_invite ? (
                        <>
                          <p className="font-medium">{p.owner_invite.full_name}</p>
                          <p className="text-xs text-muted-foreground">{p.owner_invite.email}</p>
                        </>
                      ) : (
                        <span className="text-muted-foreground">No pending Owner invitation</span>
                      )}
                    </TableCell>
                    <TableCell>{p.owner_invite?.status ?? '—'}</TableCell>
                    <TableCell>
                      {p.owner_invite?.sent_at ? formatDate(p.owner_invite.sent_at) : '—'}
                    </TableCell>
                    <TableCell>
                      {p.owner_invite?.expires_at ? formatDate(p.owner_invite.expires_at) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </QueueSection>

          <QueueSection
            title="Suspended practices"
            description="Tenants with suspended subscription status"
            empty={queue.suspended.length === 0}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Practice</TableHead>
                  <TableHead>Subdomain</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.suspended.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/super-admin/practices/${p.id}`} className="font-medium hover:text-primary">
                        {p.clinic_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.subdomain}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </QueueSection>
        </div>
      )}
    </AppPage>
  );
}
