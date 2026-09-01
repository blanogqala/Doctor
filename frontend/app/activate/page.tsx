'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { activationsApi, type ActivationPreview } from '@/lib/api/activations';
import { authApi } from '@/lib/api/auth';
import { AuthShell } from '@/components/layout/auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { invitationHostAction, practiceDashboardPath } from '@/lib/invite/invitation-ui';

function ActivateForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [preview, setPreview] = useState<ActivationPreview | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('Missing activation token');
      setLoading(false);
      return;
    }
    activationsApi
      .validate(token)
      .then((data) => {
        const hostAction = invitationHostAction(data.subdomain, '/activate', token, {
          hostname: typeof window !== 'undefined' ? window.location.hostname : '',
        });
        if (hostAction.type === 'redirect') {
          window.location.replace(hostAction.href);
          return;
        }
        if (hostAction.type === 'invalid_host') {
          setError('This activation is not valid on this practice site.');
          return;
        }
        setPreview(data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Invalid activation link'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 10) {
      setError('Password must be at least 10 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      const result = await activationsApi.accept(token, password);
      authApi.setToken(result.csrf_token);
      const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
      router.replace(
        preview?.subdomain
          ? practiceDashboardPath(preview.subdomain, { hostname })
          : '/dashboard'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not activate account');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error && !preview) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" />
        {error}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {preview && (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <p className="font-medium">{preview.practice_name}</p>
          <p className="text-muted-foreground">
            {preview.practice_name} has invited you to activate your existing patient profile.
          </p>
          <p className="mt-1 text-sm">
            Email
            <span className="ml-2 font-medium text-foreground">{preview.email}</span>
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="password">Create password</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
          minLength={10}
        />
        <p className="text-xs text-muted-foreground">At least 10 characters, with a letter and a number.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input
          id="confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
          minLength={10}
        />
      </div>

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Activating…
          </>
        ) : (
          <>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Activate My Account
          </>
        )}
      </Button>
    </form>
  );
}

export default function ActivatePage() {
  return (
    <AuthShell
      title="Welcome to MediNathi"
      subtitle="Activate your existing patient profile"
      cardTitle="Activate Patient Portal"
      cardDescription="Create a password to access the portal for this practice"
    >
      <Suspense
        fallback={
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <ActivateForm />
      </Suspense>
    </AuthShell>
  );
}
