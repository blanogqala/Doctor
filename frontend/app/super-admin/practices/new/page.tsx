'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { superAdminApi } from '@/lib/api/super-admin';
import {
  SUBSCRIPTION_PLANS,
  resolveInquiryPlanPrefill,
  isLegacyAmbiguousInquiry,
  type SubscriptionPlan,
} from '@/lib/subscription-plans';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AppPage } from '@/components/layout/app-page';
import { PageHeader } from '@/components/layout/page-header';
import { formatCurrency } from '@/lib/format';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const STEPS = ['Practice', 'Plan & seats', 'Practice Owner', 'Review', 'Create'] as const;

type InquiryPrefill = {
  full_name: string;
  email: string;
  hpcsa_number: string;
  practice_name: string | null;
  practice_type?: string | null;
  requested_subscription_plan?: string | null;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 63);
}

function emptyForm(plan: SubscriptionPlan = 'SMALL_PRACTICE') {
  const planInfo = SUBSCRIPTION_PLANS.find((p) => p.plan === plan)!;
  return {
    clinic_name: '',
    subdomain: '',
    email: '',
    subscription_plan: plan,
    doctor_seat_limit: plan === 'ENTERPRISE' ? '10' : String(planInfo.doctorSeatLimit),
    monthly_fee_rands:
      planInfo.monthlyFeeCents != null ? String(planInfo.monthlyFeeCents / 100) : '',
    owner_full_name: '',
    owner_email: '',
    owner_hpcsa_number: '',
  };
}

function formFromPrefill(prefill: InquiryPrefill) {
  const resolvedPlan = resolveInquiryPlanPrefill({
    requested_subscription_plan: prefill.requested_subscription_plan,
    practice_type: prefill.practice_type,
  });
  const defaultPlan: SubscriptionPlan = resolvedPlan ?? 'SMALL_PRACTICE';
  const defaultPlanInfo = SUBSCRIPTION_PLANS.find((p) => p.plan === defaultPlan)!;
  return {
    clinic_name: prefill.practice_name ?? '',
    subdomain: slugify(prefill.practice_name ?? ''),
    email: prefill.email ?? '',
    subscription_plan: defaultPlan,
    doctor_seat_limit:
      defaultPlan === 'ENTERPRISE' ? '10' : String(defaultPlanInfo.doctorSeatLimit),
    monthly_fee_rands:
      defaultPlanInfo.monthlyFeeCents != null
        ? String(defaultPlanInfo.monthlyFeeCents / 100)
        : '',
    owner_full_name: prefill.full_name ?? '',
    owner_email: prefill.email ?? '',
    owner_hpcsa_number: prefill.hpcsa_number ?? '',
    // When SMALL_CLINIC with no requested plan, leave plan selectable but flag ambiguity
    _planUnresolved: !resolvedPlan && isLegacyAmbiguousInquiry(prefill.practice_type),
  };
}

export default function OnboardPracticePage() {
  const searchParams = useSearchParams();
  const inquiryId = searchParams.get('inquiryId');

  const [step, setStep] = useState(0);
  const [form, setForm] = useState(() => emptyForm());
  const [legacyAmbiguous, setLegacyAmbiguous] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState(Boolean(inquiryId));
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    message: string;
    subdomain: string;
    practiceId: string;
    emailDelivered: boolean;
    invitationId?: string;
    uatInvitationUrl?: string;
  } | null>(null);

  useEffect(() => {
    if (!inquiryId) {
      setPrefillLoading(false);
      return;
    }

    let cancelled = false;

    async function loadInquiry() {
      setPrefillLoading(true);
      setPrefillError(null);

      // Optional cache — never authoritative alone
      let cached: InquiryPrefill | null = null;
      try {
        const raw = sessionStorage.getItem(`inquiry-prefill-${inquiryId}`);
        if (raw) cached = JSON.parse(raw) as InquiryPrefill;
      } catch {
        cached = null;
      }

      try {
        const inquiry = await superAdminApi.getInquiry(inquiryId!);
        if (cancelled) return;
        const prefill: InquiryPrefill = {
          full_name: inquiry.full_name,
          email: inquiry.email,
          hpcsa_number: inquiry.hpcsa_number,
          practice_name: inquiry.practice_name,
          practice_type: inquiry.practice_type,
          requested_subscription_plan: inquiry.requested_subscription_plan,
        };
        try {
          sessionStorage.setItem(`inquiry-prefill-${inquiryId}`, JSON.stringify(prefill));
        } catch {
          /* ignore quota */
        }
        const next = formFromPrefill(prefill);
        const { _planUnresolved, ...formFields } = next;
        setForm(formFields);
        setLegacyAmbiguous(Boolean(_planUnresolved));
      } catch (err) {
        if (cancelled) return;
        if (cached) {
          const next = formFromPrefill(cached);
          const { _planUnresolved, ...formFields } = next;
          setForm(formFields);
          setLegacyAmbiguous(Boolean(_planUnresolved));
          setPrefillError(
            'Could not refresh inquiry from server; using cached prefill. Re-open from Inquiries if data looks wrong.'
          );
        } else {
          setPrefillError(err instanceof Error ? err.message : 'Failed to load inquiry');
        }
      } finally {
        if (!cancelled) setPrefillLoading(false);
      }
    }

    void loadInquiry();
    return () => {
      cancelled = true;
    };
  }, [inquiryId]);

  const selectedPlan = SUBSCRIPTION_PLANS.find((p) => p.plan === form.subscription_plan)!;

  const set =
    (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = e.target.value;
      setForm((f) => {
        const next = { ...f, [key]: value };
        if (key === 'clinic_name' && !f.subdomain) {
          next.subdomain = slugify(value);
        }
        if (key === 'subscription_plan') {
          const plan = SUBSCRIPTION_PLANS.find((p) => p.plan === value)!;
          next.doctor_seat_limit =
            plan.plan === 'ENTERPRISE' ? next.doctor_seat_limit : String(plan.doctorSeatLimit);
          next.monthly_fee_rands =
            plan.monthlyFeeCents != null ? String(plan.monthlyFeeCents / 100) : next.monthly_fee_rands;
          setLegacyAmbiguous(false);
        }
        return next;
      });
    };

  const canNext = () => {
    if (step === 0) return form.clinic_name.trim() && form.subdomain.trim();
    if (step === 1) {
      if (legacyAmbiguous) return false;
      if (form.subscription_plan === 'ENTERPRISE') {
        return Number(form.doctor_seat_limit) >= 6 && Number(form.monthly_fee_rands) > 0;
      }
      return true;
    }
    if (step === 2) return form.owner_full_name.trim() && form.owner_email.trim();
    return true;
  };

  const handleCreate = async () => {
    setError(null);
    setLoading(true);
    try {
      const monthlyFeeCents =
        form.subscription_plan === 'ENTERPRISE'
          ? Math.round(Number(form.monthly_fee_rands) * 100)
          : selectedPlan.monthlyFeeCents ?? undefined;

      const result = await superAdminApi.createPractice({
        clinic_name: form.clinic_name.trim(),
        subdomain: form.subdomain.trim().toLowerCase(),
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
        owner_full_name: form.owner_full_name.trim(),
        owner_email: form.owner_email.trim(),
        ...(form.owner_hpcsa_number.trim()
          ? { owner_hpcsa_number: form.owner_hpcsa_number.trim() }
          : {}),
        subscription_plan: form.subscription_plan,
        ...(form.subscription_plan === 'ENTERPRISE'
          ? {
              doctor_seat_limit: Number(form.doctor_seat_limit),
              monthly_fee_cents: monthlyFeeCents,
            }
          : {}),
        ...(inquiryId ? { inquiry_id: inquiryId } : {}),
      });

      if (inquiryId) sessionStorage.removeItem(`inquiry-prefill-${inquiryId}`);

      setSuccess({
        message: result.message,
        subdomain: result.practice.subdomain,
        practiceId: result.practice.id,
        emailDelivered: result.email_delivered,
        invitationId: result.invitation?.id,
        ...(result.uat_invitation_url
          ? { uatInvitationUrl: result.uat_invitation_url }
          : {}),
      });
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Onboarding failed');
    } finally {
      setLoading(false);
    }
  };

  if (prefillLoading) {
    return (
      <AppPage>
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading inquiry…
        </div>
      </AppPage>
    );
  }

  if (success && step === 4) {
    return (
      <AppPage>
        <div className="mx-auto max-w-lg space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                Practice created
              </CardTitle>
              <CardDescription>{success.message}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!success.emailDelivered && success.invitationId && (
                <p className="rounded-lg border border-warning/30 bg-warning-soft/40 p-3 text-sm">
                  Practice created. Owner invitation could not be delivered. Resend it from the
                  Practice workspace.
                </p>
              )}
              {success.uatInvitationUrl && (
                <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50/80 p-3">
                  <p className="text-sm font-medium text-amber-950">
                    UAT invitation link — non-production only
                  </p>
                  <p className="text-xs text-amber-900/90">
                    This link is visible only because UAT invitation testing is enabled. Production
                    invitations are delivered by email only.
                  </p>
                  <p className="break-all rounded-md border border-amber-200 bg-white/80 p-2 font-mono text-xs text-slate-800">
                    {success.uatInvitationUrl}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(success.uatInvitationUrl!);
                        toast.success('UAT invitation link copied');
                      } catch {
                        toast.error('Could not copy link');
                      }
                    }}
                  >
                    Copy invitation link
                  </Button>
                </div>
              )}
              <Button asChild className="w-full">
                <Link href={`/super-admin/practices/${success.practiceId}`}>Open Practice workspace</Link>
              </Button>
              <Button variant="outline" asChild className="w-full">
                <Link href="/super-admin/practices">View all practices</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage>
      <PageHeader
        title="Onboard practice"
        description="Create a Practice and send a secure Owner invitation — no passwords are generated."
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/super-admin/practices">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back
            </Link>
          </Button>
        }
      />

      {prefillError && (
        <p className="mb-4 rounded-lg border border-warning/30 bg-warning-soft/40 p-3 text-sm">
          {prefillError}
        </p>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        {STEPS.slice(0, 4).map((label, index) => (
          <div
            key={label}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium',
              index === step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            )}
          >
            {index + 1}. {label}
          </div>
        ))}
      </div>

      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>{STEPS[step]}</CardTitle>
          <CardDescription>
            {step === 0 && 'Practice identity only — branding is configured by Reception later.'}
            {step === 1 && 'Select the commercial plan. Enterprise allows custom seats and fee.'}
            {step === 2 && 'The Owner receives an email to create their own password.'}
            {step === 3 && 'Review before creating the Practice and sending the invitation.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 0 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="clinic_name">Practice name</Label>
                <Input id="clinic_name" value={form.clinic_name} onChange={set('clinic_name')} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subdomain">Subdomain</Label>
                <Input id="subdomain" value={form.subdomain} onChange={set('subdomain')} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Business email (optional)</Label>
                <Input id="email" type="email" value={form.email} onChange={set('email')} />
              </div>
            </>
          )}

          {step === 1 && (
            <>
              {legacyAmbiguous && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  This legacy inquiry covers 2–5 Doctors. Select the appropriate MedSpace
                  subscription plan (Small Practice or Clinic).
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {SUBSCRIPTION_PLANS.map((plan) => (
                  <button
                    key={plan.plan}
                    type="button"
                    onClick={() => {
                      setLegacyAmbiguous(false);
                      setForm((f) => ({
                        ...f,
                        subscription_plan: plan.plan,
                        doctor_seat_limit:
                          plan.plan === 'ENTERPRISE' ? f.doctor_seat_limit : String(plan.doctorSeatLimit),
                        monthly_fee_rands:
                          plan.monthlyFeeCents != null
                            ? String(plan.monthlyFeeCents / 100)
                            : f.monthly_fee_rands,
                      }));
                    }}
                    className={cn(
                      'rounded-xl border p-4 text-left transition-colors',
                      form.subscription_plan === plan.plan && !legacyAmbiguous
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/40'
                    )}
                  >
                    <p className="font-semibold">{plan.label}</p>
                    <p className="text-sm text-muted-foreground">{plan.description}</p>
                    <p className="mt-2 text-sm font-medium">
                      {plan.monthlyFeeCents != null
                        ? `${formatCurrency(plan.monthlyFeeCents)}/month`
                        : 'Custom fee'}
                    </p>
                  </button>
                ))}
                {form.subscription_plan === 'ENTERPRISE' && !legacyAmbiguous && (
                  <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="doctor_seat_limit">Contracted Doctor seats</Label>
                      <Input
                        id="doctor_seat_limit"
                        type="number"
                        min={6}
                        value={form.doctor_seat_limit}
                        onChange={set('doctor_seat_limit')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="monthly_fee_rands">Configured monthly fee (ZAR)</Label>
                      <Input
                        id="monthly_fee_rands"
                        type="number"
                        min={1}
                        value={form.monthly_fee_rands}
                        onChange={set('monthly_fee_rands')}
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="owner_full_name">Owner full name</Label>
                <Input
                  id="owner_full_name"
                  value={form.owner_full_name}
                  onChange={set('owner_full_name')}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="owner_email">Owner email</Label>
                <Input
                  id="owner_email"
                  type="email"
                  value={form.owner_email}
                  onChange={set('owner_email')}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="owner_hpcsa_number">HPCSA number</Label>
                <Input
                  id="owner_hpcsa_number"
                  value={form.owner_hpcsa_number}
                  onChange={set('owner_hpcsa_number')}
                />
              </div>
            </>
          )}

          {step === 3 && (
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Practice</dt>
                <dd className="font-medium">{form.clinic_name}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Plan</dt>
                <dd className="font-medium">{selectedPlan.label}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Doctor seats</dt>
                <dd className="font-medium">
                  {form.subscription_plan === 'ENTERPRISE'
                    ? form.doctor_seat_limit
                    : selectedPlan.doctorSeatLimit}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Configured monthly fee</dt>
                <dd className="font-medium">
                  {formatCurrency(
                    form.subscription_plan === 'ENTERPRISE'
                      ? Math.round(Number(form.monthly_fee_rands) * 100)
                      : (selectedPlan.monthlyFeeCents ?? 0)
                  )}
                  /month
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Practice Owner</dt>
                <dd className="text-right font-medium">
                  {form.owner_full_name}
                  <br />
                  <span className="text-muted-foreground">{form.owner_email}</span>
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Subdomain</dt>
                <dd className="font-medium">{form.subdomain}.medspace.co.za</dd>
              </div>
              <p className="rounded-lg border bg-muted/40 p-3 text-muted-foreground">
                Creating this Practice will send a secure account setup invitation to the Practice Owner.
                MedSpace will never email a password.
              </p>
            </dl>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex flex-wrap justify-between gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={step === 0 || loading}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              Back
            </Button>
            {step < 3 ? (
              <Button
                type="button"
                disabled={!canNext()}
                onClick={() => setStep((s) => s + 1)}
              >
                Next
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button type="button" disabled={loading} onClick={handleCreate}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Practice & Send Invitation
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </AppPage>
  );
}
