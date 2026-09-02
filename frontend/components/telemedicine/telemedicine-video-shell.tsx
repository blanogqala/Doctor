'use client';

import '@livekit/components-styles';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { RoomAudioRenderer } from '@livekit/components-react';
import { useAuth } from '@/lib/auth-context';
import { useTelemedicineSessionOptional } from '@/lib/telemedicine-session-context';
import { useTelemedicineJoin } from '@/hooks/useTelemedicineJoin';
import { useToast } from '@/hooks/use-toast';
import { appointmentsApi } from '@/lib/api/appointments';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConnectionStatusBanner, useRemoteParticipantPresent } from './connection-status-banner';
import { DoctorCallContextPanel } from './doctor-call-context-panel';
import { EndCallConfirmDialog } from './end-call-confirm-dialog';
import { PatientWaitingRoom } from './patient-waiting-room';
import {
  LocalPreviewTile,
  LocalTrackPublisher,
  RemoteVideoStage,
  VideoCallControls,
} from './video-call-controls';
import { Maximize2, Minimize2, X } from 'lucide-react';
import { formatDurationSeconds } from '@/lib/format';

const LiveKitRoom = dynamic(
  () => import('@livekit/components-react').then((m) => m.LiveKitRoom),
  { ssr: false }
);

const EMBED_SLOT_ID = 'telemedicine-embed-slot';

function isDoctorRecordWorkspace(pathname: string, patientId: string) {
  const base = `/doctor/records/${patientId}/`;
  return pathname.startsWith(`${base}view/`) || pathname.startsWith(`${base}edit/`);
}

export function TelemedicineRoomRoot() {
  const ctx = useTelemedicineSessionOptional();
  const { toast } = useToast();
  if (!ctx?.session || !ctx.livekit) return null;

  return (
    <LiveKitRoom
      token={ctx.livekit.token}
      serverUrl={ctx.livekit.url}
      connect
      audio={false}
      video={false}
      onError={(error) => {
        console.error('LiveKit room error', error);
        toast({
          title: 'Call connection issue',
          description: error.message,
          variant: 'destructive',
        });
      }}
      onDisconnected={() => {
        ctx.setLivekit(null);
      }}
    >
      <RoomAudioRenderer />
      <TelemedicineVideoShell />
    </LiveKitRoom>
  );
}

function TelemedicineVideoShell() {
  const ctx = useTelemedicineSessionOptional();
  const pathname = usePathname();
  const { user } = useAuth();
  const { toast } = useToast();
  const { leaveCall, endCall } = useTelemedicineJoin();
  const [leaving, setLeaving] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [embedSlot, setEmbedSlot] = useState<HTMLElement | null>(null);
  const remotePresent = useRemoteParticipantPresent();

  const session = ctx?.session;
  const livekit = ctx?.livekit;

  useEffect(() => {
    setEmbedSlot(document.getElementById(EMBED_SLOT_ID));
  }, [pathname]);

  const role = user?.role === 'DOCTOR' ? 'DOCTOR' : 'PATIENT';

  const handleLeave = useCallback(async () => {
    if (!session) return;
    setLeaving(true);
    try {
      await leaveCall(session.appointmentId);
      ctx?.endSession();
      toast({
        title: role === 'PATIENT' ? 'You left the call' : 'Left consultation room',
      });
    } finally {
      setLeaving(false);
    }
  }, [leaveCall, session, ctx, toast, role]);

  const handleDoctorEnd = useCallback(async () => {
    if (!session) return;
    setLeaving(true);
    try {
      await endCall(session.appointmentId);
      ctx?.endSession();
      setConfirmEnd(false);
      toast({
        title: 'Virtual consultation ended',
        description: 'Clinical note is still a draft. Continue documentation when ready.',
      });
    } catch (err) {
      toast({
        title: 'Failed to end consultation',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setLeaving(false);
    }
  }, [endCall, session, ctx, toast]);

  useEffect(() => {
    if (!session) return;
    const poll = async () => {
      try {
        const appt = await appointmentsApi.get(session.appointmentId);
        ctx?.updateSession({
          patientJoinedAt: appt.patient_joined_at,
          doctorJoinedAt: appt.doctor_joined_at,
          telemedicineEndedAt: appt.telemedicine_ended_at,
        });
        if (appt.telemedicine_ended_at && role === 'PATIENT') {
          ctx?.endSession();
        }
      } catch {
        // ignore
      }
    };
    const timer = setInterval(poll, 10_000);
    void poll();
    return () => clearInterval(timer);
  }, [session, role, ctx]);

  if (!session || !livekit || !ctx) return null;

  const {
    sessionState,
    minimized,
    expanded,
    callStartedAt,
    setMinimized,
    setExpanded,
    updateSession,
  } = ctx;

  void updateSession;

  const embedded =
    role === 'DOCTOR' && isDoctorRecordWorkspace(pathname, session.patientId);

  const showWaiting =
    role === 'PATIENT' && sessionState === 'WAITING' && !remotePresent;

  const embeddedSurface = (
    <EmbeddedCallSurface
      role={role}
      session={session}
      sessionState={sessionState}
      remotePresent={remotePresent}
      callStartedAt={callStartedAt}
      leaving={leaving}
      onLeave={() => void handleLeave()}
      onEndRequest={() => setConfirmEnd(true)}
    />
  );

  if (embedded && embedSlot) {
    return (
      <>
        {createPortal(embeddedSurface, embedSlot)}
        <EndCallConfirmDialog
          open={confirmEnd}
          onOpenChange={setConfirmEnd}
          loading={leaving}
          onConfirm={() => void handleDoctorEnd()}
        />
      </>
    );
  }

  if (embedded) {
    return null;
  }

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-6 right-6 z-50 flex min-h-11 items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg hover:bg-slate-800"
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
        </span>
        {role === 'PATIENT' ? session.doctorName ?? 'Doctor' : session.patientName}
      </button>
    );
  }

  return (
    <>
      <div
        className={cn(
          'fixed z-50 flex flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 text-white shadow-2xl',
          expanded ? 'inset-2 sm:inset-4' : 'bottom-4 right-4 w-[min(100vw-2rem,360px)] max-h-[85dvh]'
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {role === 'PATIENT' ? session.doctorName ?? 'Doctor' : session.patientName}
            </p>
            {callStartedAt && remotePresent && (
              <CallTimer startedAt={callStartedAt} />
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-white/80 hover:bg-white/10"
              onClick={() => setExpanded(!expanded)}
              aria-label={expanded ? 'Minimize call window' : 'Expand call window'}
            >
              {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-white/80 hover:bg-white/10"
              onClick={() => setMinimized(true)}
              aria-label="Minimize call window"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <ConnectionStatusBanner />

        <div className={cn('relative min-h-0 flex-1', expanded ? 'min-h-[50dvh]' : 'aspect-video')}>
          <LocalTrackPublisher />
          {showWaiting ? (
            <PatientWaitingRoom
              doctorName={session.doctorName ?? 'Your doctor'}
              scheduledAt={session.patientJoinedAt ?? new Date().toISOString()}
              reason={session.reason}
            />
          ) : (
            <div className="relative h-full">
              <RemoteVideoStage
                label={
                  role === 'PATIENT'
                    ? 'Waiting for your doctor…'
                    : 'Waiting for patient video…'
                }
              />
              <LocalPreviewTile className="absolute bottom-2 right-2 h-20 w-16 sm:h-24 sm:w-32" />
              <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                {session.patientJoinedAt && (
                  <Badge className="border-0 bg-emerald-600/90 text-[10px]">Patient joined</Badge>
                )}
                {session.doctorJoinedAt && (
                  <Badge className="border-0 bg-teal-600/90 text-[10px]">Doctor in call</Badge>
                )}
              </div>
            </div>
          )}
        </div>

        <VideoCallControls
          role={role}
          leaving={leaving}
          onLeave={() => void handleLeave()}
          onEnd={() => setConfirmEnd(true)}
        />
      </div>

      <EndCallConfirmDialog
        open={confirmEnd}
        onOpenChange={setConfirmEnd}
        loading={leaving}
        onConfirm={() => void handleDoctorEnd()}
      />
    </>
  );
}

function EmbeddedCallSurface({
  role,
  session,
  sessionState,
  remotePresent,
  callStartedAt,
  leaving,
  onLeave,
  onEndRequest,
}: {
  role: 'DOCTOR' | 'PATIENT';
  session: NonNullable<ReturnType<typeof useTelemedicineSessionOptional>>['session'];
  sessionState: string | null;
  remotePresent: boolean;
  callStartedAt: string | null;
  leaving: boolean;
  onLeave: () => void;
  onEndRequest: () => void;
}) {
  if (!session) return null;

  const showWaiting = sessionState === 'WAITING' && !remotePresent && role === 'PATIENT';
  const recordId = session.recordId;
  const consultationHref = recordId
    ? `/doctor/records/${session.patientId}/edit/${recordId}?tab=clinical`
    : undefined;

  return (
    <div className="overflow-hidden rounded-lg border bg-slate-900">
      <ConnectionStatusBanner />
      <div className="flex min-h-[320px] flex-col lg:min-h-[420px] lg:flex-row">
        <div className="relative min-h-[240px] flex-1">
          <LocalTrackPublisher />
          {showWaiting ? (
            <PatientWaitingRoom
              doctorName={session.doctorName ?? 'Doctor'}
              scheduledAt={new Date().toISOString()}
              reason={session.reason}
            />
          ) : (
            <div className="relative h-full min-h-[240px]">
              <RemoteVideoStage label="Waiting for patient video…" />
              <LocalPreviewTile className="absolute bottom-3 right-3 h-24 w-32" />
            </div>
          )}
        </div>
        {role === 'DOCTOR' && (
          <DoctorCallContextPanel
            patientName={session.patientName}
            reason={session.reason}
            patientFolderHref={`/doctor/records/${session.patientId}/view/${recordId ?? ''}`}
            consultationHref={consultationHref}
          />
        )}
      </div>
      {callStartedAt && remotePresent && (
        <div className="border-t border-white/10 px-3 py-1 text-xs text-white/60">
          <CallTimer startedAt={callStartedAt} />
        </div>
      )}
      <VideoCallControls
        role={role}
        leaving={leaving}
        onLeave={onLeave}
        onEnd={onEndRequest}
      />
    </div>
  );
}

function CallTimer({ startedAt }: { startedAt: string }) {
  const [seconds, setSeconds] = useState(() =>
    Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds(Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  return <span>{formatDurationSeconds(seconds)}</span>;
}
