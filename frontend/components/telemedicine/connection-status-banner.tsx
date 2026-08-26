'use client';

import { useConnectionState, useParticipants } from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';
import { Loader2, WifiOff } from 'lucide-react';

export function ConnectionStatusBanner() {
  const state = useConnectionState();
  const participants = useParticipants();

  if (state === ConnectionState.Connecting) {
    return (
      <div className="flex items-center justify-center gap-2 bg-slate-700/90 px-3 py-2 text-xs text-white">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Connecting to the consultation room…
      </div>
    );
  }

  if (state === ConnectionState.Reconnecting) {
    return (
      <div className="flex items-center justify-center gap-2 bg-amber-600/90 px-3 py-2 text-xs text-white">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Connection interrupted. Trying to reconnect…
      </div>
    );
  }

  if (state === ConnectionState.Disconnected) {
    return (
      <div className="flex items-center justify-center gap-2 bg-red-700/90 px-3 py-2 text-xs text-white">
        <WifiOff className="h-3.5 w-3.5" />
        Disconnected from the consultation room.
      </div>
    );
  }

  if (participants.length >= 2 && state === ConnectionState.Connected) {
    return null;
  }

  return null;
}

export function useRemoteParticipantPresent() {
  const participants = useParticipants();
  return participants.filter((p) => !p.isLocal).length > 0;
}
