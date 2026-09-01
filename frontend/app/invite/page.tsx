'use client';

import { Suspense, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { invitationsApi, type InvitationPreview } from '@/lib/api/invitations';
import { authApi } from '@/lib/api/auth';
import { ApiError } from '@/lib/api';
import { AuthShell } from '@/components/layout/auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react';
import {
  invitationRoleLabel,
  invitationUserMessage,
  practiceLoginPath,
} from '@/lib/invite/invitation-ui';
import { PASSWORD_REQUIREMENTS_HINT, validatePasswordClient } from '@/lib/password-policy';

function InviteStatus({
  title,
  message,
  actionHref,
  actionLabel,
}: {
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="space-y-4" role="alert">
      <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <div>
          <p className="font-medium text-foreground">{title}</p>
          <p className="mt-1 text-muted-foreground">{message}</p>
        </div>
      </div>
      {actionHref && actionLabel && (
        <Button asChild variant="outline" className="w-full">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      )}
    </div>
  );
}

function InviteAcceptForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const passwordHintId = useId();
  const emailId = useId();

  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fatalTitle, setFatalTitle] = useState<string | null>(null);
  const [activated, setActivated] = useState(false);

  useEffect(() => {
    if (activated) return;
    if (!token) {
      setFatalTitle('Invitation link missing');
      setError(
        'This page needs a valid invitation link. Please use the link from your invitation email.'
      );
      setLoading(false);
      return;
    }
    invitationsApi
      .validate(token)
      .then(setPreview)
      .catch((err) => {
        const code = err instanceof ApiError ? err.code : undefined;
        const status = err instanceof ApiError ? err.status : undefined;
        setFatalTitle('Invitation unavailable');
        setError(
          invitationUserMessage({
            code,
            status,
            fallback: err instanceof Error ? err.message : undefined,
          })
        );
      })
      .finally(() => setLoading(false));
  }, [token, activated]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const passwordCheck = validatePasswordClient(password);
    if (!passwordCheck.ok) {
      setError(passwordCheck.error);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      const result = await invitationsApi.accept(token, password);
      authApi.setToken(result.csrf_token);
      setActivated(true);
      router.replace('/invite');
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      const status = err instanceof ApiError ? err.status : undefined;
      setError(
        invitationUserMessage({
          code,
          status,
          fallback: err instanceof Error ? err.message : undefined,
        })
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12 text-muted-foreground" aria-live="polite">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        <span className="sr-only">Checking invitation</span>
      </div>
    );
  }

  if (activated && preview) {
    const loginHref = practiceLoginPath(preview.subdomain);
    return (
      <div className="space-y-5" role="status">
        <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4 text-sm">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
          <div>
            <p className="font-medium">Account activated successfully.</p>
            <p className="mt-1 text-muted-foreground">
              You can now sign in to {preview.practice_name}.
            </p>
          </div>
        </div>
        <Button asChild size="lg" className="w-full">
          <Link href={loginHref}>Continue to {preview.practice_name}</Link>
        </Button>
      </div>
    );
  }

  if (error && !preview) {
    return (
      <InviteStatus
        title={fatalTitle || 'Invitation unavailable'}
        message={error}
        actionHref="/login"
        actionLabel="Go to sign in"
      />
    );
  }

  if (!preview) return null;

  const roleLabel = invitationRoleLabel(preview.role, preview.is_practice_owner);

  return (
    <>
      <div className="mb-6 space-y-3 rounded-lg border bg-muted/40 p-4 text-sm">
        <p className="text-muted-foreground">You&apos;ve been invited to join:</p>
        <p className="text-lg font-semibold tracking-tight text-foreground">{preview.practice_name}</p>
        <p>
          as <span className="font-medium">{roleLabel}</span>
        </p>
        {preview.full_name ? (
          <p className="text-muted-foreground">
            Invited as <span className="font-medium text-foreground">{preview.full_name}</span>
          </p>
        ) : null}
        <div className="space-y-1.5 pt-1">
          <Label htmlFor={emailId}>Email</Label>
          <Input
            id={emailId}
            type="email"
            value={preview.email}
            readOnly
            autoComplete="username"
            className="bg-muted"
          />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="password">Create your password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={10}
              aria-invalid={Boolean(error)}
              aria-describedby={passwordHintId}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p id={passwordHintId} className="text-xs text-muted-foreground">
            {PASSWORD_REQUIREMENTS_HINT}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <div className="relative">
            <Input
              id="confirm"
              type={showConfirm ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              minLength={10}
              aria-invalid={Boolean(error)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error && (
          <div
            className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
            {error}
          </div>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              Activating account…
            </>
          ) : (
            'Activate account'
          )}
        </Button>
      </form>
    </>
  );
}

export default function InvitePage() {
  return (
    <AuthShell
      title="Welcome to MediNathi"
      subtitle="You've been invited to join a practice"
      cardTitle="Activate your account"
      cardDescription="Create a password for the email address on this invitation. MediNathi never emails passwords."
      brandName="MediNathi"
      size="sm"
    >
      <Suspense fallback={<Loader2 className="mx-auto h-6 w-6 animate-spin" />}>
        <InviteAcceptForm />
      </Suspense>
    </AuthShell>
  );
}
