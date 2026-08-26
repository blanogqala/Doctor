'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { practiceManagementApi, type PracticeManagementSummary } from '@/lib/api/practice-management';
import { planLabel } from '@/lib/subscription-plans';
import { AppPage } from '@/components/layout/app-page';
import { PageHeader } from '@/components/layout/page-header';
import { DashboardLayout } from '@/components/shared/dashboard-layout';
import { StatusBadge, type StatusTone } from '@/components/ds/status-badge';
import { MetricCard, MetricGrid } from '@/components/ds/cards';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Loader2, Mail, RefreshCw, UserMinus, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

function inviteTone(status: string): StatusTone {
  switch (status) {
    case 'PENDING':
      return 'info';
    case 'ACCEPTED':
      return 'success';
    case 'EXPIRED':
    case 'REVOKED':
      return 'danger';
    default:
      return 'neutral';
  }
}

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

export default function PracticeManagementPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<PracticeManagementSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [doctorInvite, setDoctorInvite] = useState({ full_name: '', email: '', hpcsa_number: '' });
  const [receptionInvite, setReceptionInvite] = useState({ full_name: '', email: '' });
  const [paymentRef, setPaymentRef] = useState<Record<string, string>>({});
  const [eftInstructions, setEftInstructions] = useState<{
    configured: boolean;
    instructions: {
      account_holder: string;
      bank: string;
      account_number: string;
      branch_code: string;
      reference_guidance: string;
    } | null;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summary, eft] = await Promise.all([
        practiceManagementApi.summary(),
        practiceManagementApi.eftInstructions().catch(() => null),
      ]);
      setData(summary);
      setEftInstructions(eft);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.is_practice_owner) {
      router.replace('/doctor');
      return;
    }
    load();
  }, [authLoading, user, router, load]);

  const inviteDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    setActing('invite-doctor');
    try {
      const result = await practiceManagementApi.inviteDoctor({
        full_name: doctorInvite.full_name.trim(),
        email: doctorInvite.email.trim(),
        ...(doctorInvite.hpcsa_number.trim()
          ? { hpcsa_number: doctorInvite.hpcsa_number.trim() }
          : {}),
      });
      toast.success(result.message);
      setDoctorInvite({ full_name: '', email: '', hpcsa_number: '' });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invite failed');
    } finally {
      setActing(null);
    }
  };

  const inviteReception = async (e: React.FormEvent) => {
    e.preventDefault();
    setActing('invite-reception');
    try {
      const result = await practiceManagementApi.inviteReception({
        full_name: receptionInvite.full_name.trim(),
        email: receptionInvite.email.trim(),
      });
      toast.success(result.message);
      setReceptionInvite({ full_name: '', email: '' });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invite failed');
    } finally {
      setActing(null);
    }
  };

  const resend = async (id: string) => {
    setActing(`resend-${id}`);
    try {
      const result = await practiceManagementApi.resendInvitation(id);
      toast.success(result.email_delivered ? 'Invitation resent' : 'Invitation rotated — email failed');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Resend failed');
    } finally {
      setActing(null);
    }
  };

  const revoke = async (id: string) => {
    setActing(`revoke-${id}`);
    try {
      await practiceManagementApi.revokeInvitation(id);
      toast.success('Invitation revoked');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Revoke failed');
    } finally {
      setActing(null);
    }
  };

  const deactivate = async (profileId: string) => {
    setActing(`deactivate-${profileId}`);
    try {
      await practiceManagementApi.deactivateMember(profileId);
      toast.success('Member deactivated');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Deactivate failed');
    } finally {
      setActing(null);
    }
  };

  const reportPayment = async (invoiceId: string) => {
    const reference = paymentRef[invoiceId]?.trim();
    if (!reference) {
      toast.error('Payment reference is required');
      return;
    }
    setActing(`pay-${invoiceId}`);
    try {
      await practiceManagementApi.reportPayment(invoiceId, reference);
      toast.success('Payment reported — awaiting Super Admin verification');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Report failed');
    } finally {
      setActing(null);
    }
  };

  if (authLoading || loading) {
    return (
      <DashboardLayout>
        <AppPage>
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading…
          </div>
        </AppPage>
      </DashboardLayout>
    );
  }

  if (error || !data) {
    return (
      <DashboardLayout>
        <AppPage>
          <p className="text-destructive">{error ?? 'Unable to load practice management'}</p>
        </AppPage>
      </DashboardLayout>
    );
  }

  const { practice, seats, team, invitations, invoices } = data;
  const currentInvoice = invoices.find(
    (i) => i.status === 'DUE' || i.status === 'OVERDUE' || i.status === 'PAYMENT_REPORTED'
  );

  return (
    <DashboardLayout>
      <AppPage>
      <PageHeader
        title="Practice Management"
        description={`${practice.clinic_name} · ${planLabel(practice.subscription_plan)}`}
      />

      <Tabs defaultValue="team" className="space-y-6">
        <TabsList>
          <TabsTrigger value="team">Team & Access</TabsTrigger>
          <TabsTrigger value="billing">Subscription & Billing</TabsTrigger>
        </TabsList>

        <TabsContent value="team" className="space-y-6">
          <MetricGrid>
            <MetricCard
              label="Doctor seats"
              value={`${seats.allocated}/${seats.limit}`}
              context={`${seats.available} available · ${seats.pending} pending`}
              tone="clinical"
            />
          </MetricGrid>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  Invite Doctor
                </CardTitle>
                <CardDescription>Uses one doctor seat while pending</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={inviteDoctor} className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="doc_name">Full name</Label>
                    <Input
                      id="doc_name"
                      value={doctorInvite.full_name}
                      onChange={(e) => setDoctorInvite((f) => ({ ...f, full_name: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="doc_email">Email</Label>
                    <Input
                      id="doc_email"
                      type="email"
                      value={doctorInvite.email}
                      onChange={(e) => setDoctorInvite((f) => ({ ...f, email: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="doc_hpcsa">HPCSA number</Label>
                    <Input
                      id="doc_hpcsa"
                      value={doctorInvite.hpcsa_number}
                      onChange={(e) => setDoctorInvite((f) => ({ ...f, hpcsa_number: e.target.value }))}
                    />
                  </div>
                  <Button type="submit" disabled={acting === 'invite-doctor' || seats.available <= 0}>
                    {acting === 'invite-doctor' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Send invitation
                  </Button>
                  {seats.available <= 0 && (
                    <p className="text-xs text-muted-foreground">No doctor seats available.</p>
                  )}
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Invite Reception
                </CardTitle>
                <CardDescription>Does not consume a doctor seat</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={inviteReception} className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="rec_name">Full name</Label>
                    <Input
                      id="rec_name"
                      value={receptionInvite.full_name}
                      onChange={(e) => setReceptionInvite((f) => ({ ...f, full_name: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rec_email">Email</Label>
                    <Input
                      id="rec_email"
                      type="email"
                      value={receptionInvite.email}
                      onChange={(e) => setReceptionInvite((f) => ({ ...f, email: e.target.value }))}
                      required
                    />
                  </div>
                  <Button type="submit" disabled={acting === 'invite-reception'}>
                    {acting === 'invite-reception' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Send invitation
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <TableSection title="Team members">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {team.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>
                        <p className="font-medium">{member.full_name}</p>
                        <p className="text-xs text-muted-foreground">{member.email}</p>
                      </TableCell>
                      <TableCell>{member.role}</TableCell>
                      <TableCell>
                        <StatusBadge
                          tone={member.is_active ? 'success' : 'neutral'}
                          label={member.is_active ? 'Active' : 'Inactive'}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        {member.is_active && member.id !== user?.id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={acting === `deactivate-${member.id}`}
                            onClick={() => deactivate(member.id)}
                          >
                            <UserMinus className="mr-1 h-3 w-3" />
                            Deactivate
                          </Button>
                        )}
                        {member.id === user?.id && (
                          <span className="text-xs text-muted-foreground">You</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
          </TableSection>

          <TableSection title="Invitations">
              {invitations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No invitations yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invitee</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invitations.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell>
                          {inv.full_name}
                          <p className="text-xs text-muted-foreground">{inv.email}</p>
                        </TableCell>
                        <TableCell>{inv.role}</TableCell>
                        <TableCell>
                          <StatusBadge tone={inviteTone(inv.status)} label={inv.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          {(inv.status === 'PENDING' || inv.status === 'EXPIRED') && (
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={acting === `resend-${inv.id}`}
                                onClick={() => resend(inv.id)}
                              >
                                <RefreshCw className="h-3 w-3" />
                              </Button>
                              {inv.status === 'PENDING' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={acting === `revoke-${inv.id}`}
                                  onClick={() => revoke(inv.id)}
                                >
                                  Revoke
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
          </TableSection>
        </TabsContent>

        <TabsContent value="billing" className="space-y-6">
          <MetricGrid>
            <MetricCard label="Plan" value={planLabel(practice.subscription_plan)} tone="info" />
            <MetricCard
              label="Monthly fee"
              value={formatCurrency(practice.monthly_fee_cents)}
              tone="primary"
            />
            <MetricCard
              label="Subscription status"
              value={practice.subscription_status}
              tone={practice.subscription_status === 'ACTIVE' ? 'success' : 'warning'}
            />
          </MetricGrid>

          {(currentInvoice?.status === 'DUE' || currentInvoice?.status === 'OVERDUE') && (
            <Card>
              <CardHeader>
                <CardTitle>Report EFT payment</CardTitle>
                <CardDescription>
                  Invoice {currentInvoice.invoice_number} · {formatCurrency(currentInvoice.amount_cents)} due{' '}
                  {formatDate(currentInvoice.due_at)}
                  {currentInvoice.status === 'OVERDUE' ? ' (overdue)' : ''}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {eftInstructions?.configured && eftInstructions.instructions ? (
                  <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                    <p className="font-medium">EFT payment instructions</p>
                    <dl className="mt-2 grid gap-1 sm:grid-cols-2">
                      <div>
                        <dt className="text-muted-foreground">Account holder</dt>
                        <dd>{eftInstructions.instructions.account_holder}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Bank</dt>
                        <dd>{eftInstructions.instructions.bank}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Account number</dt>
                        <dd>{eftInstructions.instructions.account_number}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Branch code</dt>
                        <dd>{eftInstructions.instructions.branch_code}</dd>
                      </div>
                    </dl>
                    <p className="mt-2 text-muted-foreground">
                      {eftInstructions.instructions.reference_guidance}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    EFT payment instructions require production configuration. Contact MedSpace support
                    for banking details, then report your payment reference below.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Input
                    placeholder="Bank reference / payment reference"
                    value={paymentRef[currentInvoice.id] ?? ''}
                    onChange={(e) =>
                      setPaymentRef((refs) => ({ ...refs, [currentInvoice.id]: e.target.value }))
                    }
                    className="max-w-sm"
                  />
                  <Button
                    disabled={acting === `pay-${currentInvoice.id}`}
                    onClick={() => reportPayment(currentInvoice.id)}
                  >
                    {acting === `pay-${currentInvoice.id}` && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Report payment
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {currentInvoice?.status === 'PAYMENT_REPORTED' && (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                Payment reported for {currentInvoice.invoice_number}. Awaiting Super Admin verification.
              </CardContent>
            </Card>
          )}

          <TableSection title="Invoice history">
              {invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No invoices yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell>{inv.invoice_number}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(inv.period_start)} – {formatDate(inv.period_end)}
                        </TableCell>
                        <TableCell>{formatCurrency(inv.amount_cents)}</TableCell>
                        <TableCell>
                          <StatusBadge tone={invoiceTone(inv.status)} label={inv.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
          </TableSection>
        </TabsContent>
      </Tabs>
      </AppPage>
    </DashboardLayout>
  );
}
