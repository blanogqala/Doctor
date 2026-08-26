'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { invitationsApi, type InvitationPreview } from '@/lib/api/invitations';
import { authApi } from '@/lib/api/auth';
import { AuthShell } from '@/components/layout/auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

function InviteAcceptForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('Missing invitation token');
      setLoading(false);
      return;
    }
    invitationsApi
      .validate(token)
      .then(setPreview)
      .catch((err) => setError(err instanceof Error ? err.message : 'Invalid invitation'))
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
      const result = await invitationsApi.accept(token, password);
      authApi.setToken(result.csrf_token);
      if (preview?.subdomain) {
        localStorage.setItem('practice_subdomain', preview.subdomain);
      }
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept invitation');
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

  if (!preview) return null;

  return (
    <>
      <div className="mb-6 rounded-lg border bg-muted/40 p-4 text-sm">
        <p className="font-medium">{preview.practice_name}</p>
        <p className="text-muted-foreground">
          {preview.is_practice_owner ? 'Practice Owner' : preview.role} invitation for {preview.full_name}
        </p>
        <p className="text-xs text-muted-foreground mt-1">{preview.email}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">Create password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            minLength={10}
          />
          <p className="text-xs text-muted-foreground">At least 10 characters with a letter and a number.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating account…
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Activate account
            </>
          )}
        </Button>
      </form>
    </>
  );
}

export default function InvitePage() {
  return (
    <AuthShell
      title="Accept invitation"
      subtitle="Set your password to join the practice"
      cardTitle="Account setup"
      cardDescription="MedSpace never emails passwords — you choose your own here."
      size="sm"
    >
      <Suspense fallback={<Loader2 className="mx-auto h-6 w-6 animate-spin" />}>
        <InviteAcceptForm />
      </Suspense>
    </AuthShell>
  );
}
