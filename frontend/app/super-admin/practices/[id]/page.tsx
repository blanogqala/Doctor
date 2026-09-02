'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  superAdminApi,
  type PracticeWorkspace,
  type InvitationSummary,
} from '@/lib/api/super-admin';
import { planLabel, SUBSCRIPTION_PLANS, type SubscriptionPlan } from '@/lib/subscription-plans';
import { OnboardingChecklistView } from '@/components/super-admin/onboarding-checklist';
import { AppPage } from '@/components/layout/app-page';
import { PageHeader } from '@/components/layout/page-header';
import { StatusBadge, type StatusTone } from '@/components/ds/status-badge';
import { MetricCard, MetricGrid } from '@/components/ds/cards';
import { Button } from '@/components/ui/button';
import { TableSection } from '@/components/ds/table-section';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency, formatDate } from '@/lib/format';
import { ArrowLeft, Loader2, Mail, Pencil, RefreshCw, ShieldCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';

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

export default function PracticeWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const practiceId = String(params.id);

  const [workspace, setWorkspace] = useState<PracticeWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [uatInvitationUrl, setUatInvitationUrl] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<SubscriptionPlan>('SOLO');
  const [editSeats, setEditSeats] = useState('1');
  const [editFeeRands, setEditFeeRands] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const data = await superAdminApi.getPractice(practiceId);
      setWorkspace(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workspace');
    } finally {
      setLoading(false);
    }
  }, [practiceId]);

  useEffect(() => {
    load();
  }, [load]);

  const resendInvite = async (invitation: InvitationSummary) => {
    setActing(`resend-${invitation.id}`);
    try {
      const result = await superAdminApi.resendInvitation(practiceId, invitation.id);
      toast.success(result.email_delivered ? 'Invitation resent' : 'Invitation rotated — email delivery failed');
      if (result.uat_invitation_url) {
        setUatInvitationUrl(result.uat_invitation_url);
      } else {
        setUatInvitationUrl(null);
      }
      await load({ silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Resend failed');
    } finally {
      setActing(null);
    }
  };

  const copyUatInvitationLink = async () => {
    if (!uatInvitationUrl) return;
    try {
      await navigator.clipboard.writeText(uatInvitationUrl);
      toast.success('UAT invitation link copied');
    } catch {
      toast.error('Could not copy link');
    }
  };

  const revokeInvite = async (invitation: InvitationSummary) => {
    setActing(`revoke-${invitation.id}`);
    try {
      await superAdminApi.revokeInvitation(practiceId, invitation.id);
      toast.success('Invitation revoked');
      await load({ silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Revoke failed');
    } finally {
      setActing(null);
    }
  };

  const verifyDoctor = async (doctorId: string) => {
    setActing(`verify-${doctorId}`);
    try {
      await superAdminApi.updatePractice(practiceId, { verify_doctor_id: doctorId });
      toast.success('Doctor verified');
      await load({ silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setActing(null);
    }
  };

  const verifyInvoice = async (invoiceId: string) => {
    setActing(`invoice-${invoiceId}`);
    try {
      const result = await superAdminApi.verifyInvoice(invoiceId);
      if (result.remains_suspended) {
        toast.success(
          result.message ||
            'Payment verified. Practice remains suspended — reactivate explicitly if appropriate.'
        );
      } else {
        toast.success('Payment verified');
      }
      await load({ silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verify failed');
    } finally {
      setActing(null);
    }
  };

  const openEditSubscription = () => {
    if (!workspace) return;
    const p = workspace.practice;
    const plan = (p.subscription_plan as SubscriptionPlan) || 'SOLO';
    setEditPlan(plan);
    setEditSeats(String(p.doctor_seat_limit));
    setEditFeeRands(String(p.monthly_fee_cents / 100));
    setEditError(null);
    setEditOpen(true);
  };

  const onEditPlanChange = (plan: SubscriptionPlan) => {
    setEditPlan(plan);
    const info = SUBSCRIPTION_PLANS.find((x) => x.plan === plan)!;
    if (plan === 'ENTERPRISE') {
      setEditSeats((prev) => (Number(prev) >= 6 ? prev : '6'));
      // Keep existing contractual fee for review — do not auto-overwrite
    } else {
      setEditSeats(String(info.doctorSeatLimit));
      if (info.monthlyFeeCents != null) {
        setEditFeeRands(String(info.monthlyFeeCents / 100));
      }
    }
  };

  const saveSubscription = async () => {
    if (!workspace) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const seats = Number(editSeats);
      const feeCents = Math.round(Number(editFeeRands) * 100);
      if (!Number.isFinite(seats) || seats < 1) {
        throw new Error('Doctor seat limit must be a positive number');
      }
      if (editPlan === 'ENTERPRISE' && seats < 6) {
        throw new Error('Enterprise requires at least 6 configured Doctor seats');
      }
      if (!Number.isFinite(feeCents) || feeCents <= 0) {
        throw new Error('Configured monthly fee is required');
      }
      await superAdminApi.updatePractice(practiceId, {
        subscription_plan: editPlan,
        doctor_seat_limit: seats,
        monthly_fee_cents: feeCents,
      });
      toast.success('Subscription agreement updated');
      setEditOpen(false);
      await load({ silent: true });
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setEditSaving(false);
    }
  };

  if (loading && !workspace) {
    return (
      <AppPage>
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading workspace…
        </div>
      </AppPage>
    );
  }

  if (error || !workspace) {
    return (
      <AppPage>
        <p className="text-destructive">{error ?? 'Practice not found'}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/super-admin/practices')}>
          Back to practices
        </Button>
      </AppPage>
    );
  }

  const { practice, seats, onboarding, team, invitations, invoices, activity } = workspace;

  return (
    <AppPage>
      <PageHeader
        title={practice.clinic_name}
        description={`${practice.subdomain}.MediNathi.co.za · ${planLabel(practice.subscription_plan)}`}
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/super-admin/practices">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              All practices
            </Link>
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <StatusBadge tone={subscriptionTone(practice.subscription_status)} label={practice.subscription_status} />
        {practice.owner && (
          <span className="text-sm text-muted-foreground">
            Owner: {practice.owner.full_name} ({practice.owner.email})
          </span>
        )}
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="billing">Subscription & Billing</TabsTrigger>
          <TabsTrigger value="team">Team & Seats</TabsTrigger>
          <TabsTrigger value="invitations">Invitations</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <MetricGrid>
            <MetricCard label="Doctor seats" value={`${seats.allocated}/${seats.limit}`} tone="clinical" />
            <MetricCard
              label="Configured monthly fee"
              value={formatCurrency(practice.monthly_fee_cents)}
              tone="info"
            />
            <MetricCard
              label="Branding configured"
              value={practice.branding_configured ? 'Yes' : 'No'}
              tone={practice.branding_configured ? 'success' : 'warning'}
            />
          </MetricGrid>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Onboarding checklist</CardTitle>
                <CardDescription>Operational readiness — no clinical data</CardDescription>
              </CardHeader>
              <CardContent>
                <OnboardingChecklistView checklist={onboarding} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Practice details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  <span className="text-muted-foreground">Created:</span> {formatDate(practice.created_at)}
                </p>
                {practice.trial_ends_at && (
                  <p>
                    <span className="text-muted-foreground">Trial ends:</span>{' '}
                    {formatDate(practice.trial_ends_at)}
                  </p>
                )}
                {practice.email && (
                  <p>
                    <span className="text-muted-foreground">Business email:</span> {practice.email}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="billing" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
              <div>
                <CardTitle>Subscription Agreement</CardTitle>
                <CardDescription>Commercial contract snapshot for this Practice</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={openEditSubscription}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Edit subscription
              </Button>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Plan</dt>
                  <dd className="font-medium">{planLabel(practice.subscription_plan)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    {practice.subscription_plan === 'ENTERPRISE'
                      ? 'Contracted Doctor seats'
                      : 'Doctor seats'}
                  </dt>
                  <dd className="font-medium">
                    {practice.subscription_plan === 'ENTERPRISE'
                      ? `${practice.doctor_seat_limit} configured`
                      : practice.doctor_seat_limit}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Configured monthly fee</dt>
                  <dd className="font-medium">{formatCurrency(practice.monthly_fee_cents)}/month</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>
                    <StatusBadge
                      tone={subscriptionTone(practice.subscription_status)}
                      label={practice.subscription_status}
                    />
                  </dd>
                </div>
              </dl>
              <p className="mt-4 text-xs text-muted-foreground">
                Subscription status is changed only via Activate / Suspend / Reactivate on the Practices
                list — not in this editor.
              </p>
            </CardContent>
          </Card>

          <TableSection
            title="Subscription invoices"
            description="SaaS billing — separate from patient payments"
          >
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
                      <TableHead>Due</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.invoice_number}</TableCell>
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
                            <Button
                              size="sm"
                              disabled={acting === `invoice-${inv.id}`}
                              onClick={() => verifyInvoice(inv.id)}
                            >
                              {acting === `invoice-${inv.id}` && (
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              )}
                              Verify payment
                            </Button>
                          )}
                          {inv.payment_reference && (
                            <p className="mt-1 text-xs text-muted-foreground">Ref: {inv.payment_reference}</p>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
          </TableSection>

          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Edit subscription agreement</DialogTitle>
                <DialogDescription>
                  Review proposed commercial values before saving. Fee remains the Practice contractual
                  snapshot unless you change it.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Subscription plan</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-base md:text-sm"
                    value={editPlan}
                    onChange={(e) => onEditPlanChange(e.target.value as SubscriptionPlan)}
                  >
                    {SUBSCRIPTION_PLANS.map((p) => (
                      <option key={p.plan} value={p.plan}>
                        {p.label} — {p.description}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_seats">
                    {editPlan === 'ENTERPRISE' ? 'Contracted Doctor seats (6+)' : 'Doctor seat limit'}
                  </Label>
                  <Input
                    id="edit_seats"
                    type="number"
                    min={editPlan === 'ENTERPRISE' ? 6 : 1}
                    value={editSeats}
                    onChange={(e) => setEditSeats(e.target.value)}
                    disabled={editPlan !== 'ENTERPRISE'}
                  />
                  {editPlan !== 'ENTERPRISE' ? (
                    <p className="text-xs text-muted-foreground">
                      Seat limit follows the selected plan. Reducing seats below currently allocated
                      Doctors will be rejected by the server.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Enterprise requires 6+ configured seats. Reducing below allocated seats will be
                      rejected.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_fee">Configured monthly fee (ZAR)</Label>
                  <Input
                    id="edit_fee"
                    type="number"
                    min={1}
                    value={editFeeRands}
                    onChange={(e) => setEditFeeRands(e.target.value)}
                  />
                </div>
                <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                  <p className="font-medium">Proposed values</p>
                  <p className="mt-1 text-muted-foreground">
                    {planLabel(editPlan)} · {editSeats} Doctor seat
                    {Number(editSeats) === 1 ? '' : 's'} · R{editFeeRands || '—'}/month
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Status stays {practice.subscription_status} (change via Activate/Suspend/Reactivate).
                  </p>
                </div>
                {editError && <p className="text-sm text-destructive">{editError}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditOpen(false)} disabled={editSaving}>
                  Cancel
                </Button>
                <Button onClick={saveSubscription} disabled={editSaving}>
                  {editSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save agreement
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="team" className="space-y-4">
          <TableSection
            title="Seat usage"
            description={`${seats.active} active · ${seats.pending} pending · ${seats.available} available`}
          >
              {team.length === 0 ? (
                <p className="text-sm text-muted-foreground">No team members yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>HPCSA</TableHead>
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
                        <TableCell>
                          {member.doctor ? (
                            member.doctor.is_verified ? (
                              <span className="text-success text-sm">Verified</span>
                            ) : (
                              <span className="text-warning text-sm">Unverified</span>
                            )
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {member.doctor && !member.doctor.is_verified && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={acting === `verify-${member.doctor.id}`}
                              onClick={() => verifyDoctor(member.doctor!.id)}
                            >
                              <ShieldCheck className="mr-1 h-3 w-3" />
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
        </TabsContent>

        <TabsContent value="invitations" className="space-y-4">
          {uatInvitationUrl && (
            <Card className="border-amber-300 bg-amber-50/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-amber-950">
                  UAT invitation link — non-production only
                </CardTitle>
                <CardDescription className="text-amber-900/90">
                  This link is visible only because UAT invitation testing is enabled. Production
                  invitations are delivered by email only.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="break-all rounded-md border border-amber-200 bg-white/80 p-2 font-mono text-xs text-slate-800">
                  {uatInvitationUrl}
                </p>
                <Button type="button" size="sm" onClick={copyUatInvitationLink}>
                  Copy invitation link
                </Button>
              </CardContent>
            </Card>
          )}
          <TableSection
            title="Pending & recent invitations"
            description="Secure tokens — passwords are never emailed"
          >
              {invitations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No invitations.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invitee</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invitations.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell>
                          <p className="font-medium">{inv.full_name}</p>
                          <p className="text-xs text-muted-foreground">{inv.email}</p>
                          {inv.is_practice_owner && (
                            <span className="text-xs font-medium text-primary">Practice Owner</span>
                          )}
                        </TableCell>
                        <TableCell>{inv.role}</TableCell>
                        <TableCell>
                          <StatusBadge tone={inviteTone(inv.status)} label={inv.status} />
                        </TableCell>
                        <TableCell>{formatDate(inv.expires_at)}</TableCell>
                        <TableCell className="text-right">
                          {inv.status === 'PENDING' && (
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={acting === `resend-${inv.id}`}
                                onClick={() => resendInvite(inv)}
                              >
                                {acting === `resend-${inv.id}` ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3 w-3" />
                                )}
                                <span className="sr-only sm:not-sr-only sm:ml-1">Resend</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={acting === `revoke-${inv.id}`}
                                onClick={() => revokeInvite(inv)}
                              >
                                <UserX className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                          {inv.status === 'EXPIRED' && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={acting === `resend-${inv.id}`}
                              onClick={() => resendInvite(inv)}
                            >
                              <Mail className="mr-1 h-3 w-3" />
                              Resend
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
          </TableSection>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Recent audit activity</CardTitle>
              <CardDescription>Platform operations only</CardDescription>
            </CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity recorded.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {activity.map((entry) => (
                    <li key={entry.id} className="flex flex-wrap justify-between gap-2 py-3">
                      <span>
                        <span className="font-medium">{entry.action}</span>{' '}
                        <span className="text-muted-foreground">{entry.resource}</span>
                      </span>
                      <span className="text-muted-foreground">{formatDate(entry.created_at, true)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AppPage>
  );
}
