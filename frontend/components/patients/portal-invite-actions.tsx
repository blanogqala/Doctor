'use client';

import { Button } from '@/components/ui/button';
import { portalInviteUiState } from '@/lib/patients/portal-invite';
import type { Patient } from '@/lib/types';
import { formatDate } from '@/lib/format';
import { Mail, ShieldCheck } from 'lucide-react';

interface PortalInviteActionsProps {
  patient: Patient;
  onInvite: () => void;
  onResend: () => void;
  busy?: boolean;
}

export function PortalInviteActions({
  patient,
  onInvite,
  onResend,
  busy,
}: PortalInviteActionsProps) {
  const state = portalInviteUiState(patient);

  if (state.kind === 'active') {
    return (
      <div className="flex items-center gap-2 text-sm text-success">
        <ShieldCheck className="h-4 w-4" aria-hidden />
        <span className="font-medium">{state.label}</span>
      </div>
    );
  }

  if (state.kind === 'no_email') {
    return (
      <div className="max-w-xs space-y-1">
        <Button variant="outline" disabled aria-describedby="portal-invite-hint">
          <Mail className="mr-2 h-4 w-4" />
          {state.label}
        </Button>
        <p id="portal-invite-hint" className="text-xs text-muted-foreground">
          {state.hint}
        </p>
      </div>
    );
  }

  if (state.kind === 'invited') {
    return (
      <div className="flex flex-col items-start gap-1 sm:items-end">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{state.label}</span>
          <Button variant="outline" onClick={onResend} disabled={busy}>
            {state.resendLabel}
          </Button>
        </div>
        {state.sentAt && (
          <p className="text-xs text-muted-foreground">Sent {formatDate(state.sentAt)}</p>
        )}
      </div>
    );
  }

  return (
    <Button variant="outline" onClick={onInvite} disabled={busy}>
      <Mail className="mr-2 h-4 w-4" />
      {state.label}
    </Button>
  );
}
