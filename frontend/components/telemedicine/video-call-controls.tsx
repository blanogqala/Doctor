'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Mic, MicOff, Phone, Video, VideoOff } from 'lucide-react';
import {
  useLocalParticipant,
  useRoomContext,
  VideoTrack,
  useTracks,
} from '@livekit/components-react';
import { ConnectionState, Track } from 'livekit-client';

interface VideoCallControlsProps {
  role: 'DOCTOR' | 'PATIENT';
  onLeave: () => void;
  onEnd?: () => void;
  leaving?: boolean;
  className?: string;
}

async function enableLocalMedia(
  localParticipant: ReturnType<typeof useLocalParticipant>['localParticipant'],
  roomState: ConnectionState
) {
  if (roomState !== ConnectionState.Connected) return;
  try {
    if (!localParticipant.isMicrophoneEnabled) {
      await localParticipant.setMicrophoneEnabled(true);
    }
    if (!localParticipant.isCameraEnabled) {
      await localParticipant.setCameraEnabled(true);
    }
  } catch (err) {
    console.error('Failed to publish local media', err);
  }
}

export function VideoCallControls({
  role,
  onLeave,
  onEnd,
  leaving,
  className,
}: VideoCallControlsProps) {
  const room = useRoomContext();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const connected = room.state === ConnectionState.Connected;

  const toggleMic = async () => {
    if (!connected) return;
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch (err) {
      console.error('Failed to toggle microphone', err);
    }
  };

  const toggleCamera = async () => {
    if (!connected) return;
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled);
    } catch (err) {
      console.error('Failed to toggle camera', err);
    }
  };

  const handlePrimaryEnd = () => {
    if (role === 'DOCTOR' && onEnd) {
      onEnd();
    } else {
      onLeave();
    }
  };

  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 border-t border-white/10 px-3 py-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]',
        className
      )}
    >
      <Button
        type="button"
        size="icon"
        variant="ghost"
        disabled={!connected}
        className={cn(
          'h-11 w-11 rounded-full text-white hover:bg-white/10',
          !isMicrophoneEnabled && 'bg-amber-500/20 text-amber-200'
        )}
        onClick={() => void toggleMic()}
        title={isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
        aria-label={isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
      >
        {isMicrophoneEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        disabled={!connected}
        className={cn(
          'h-11 w-11 rounded-full text-white hover:bg-white/10',
          !isCameraEnabled && 'bg-amber-500/20 text-amber-200'
        )}
        onClick={() => void toggleCamera()}
        title={isCameraEnabled ? 'Turn camera off' : 'Turn camera on'}
        aria-label={isCameraEnabled ? 'Turn camera off' : 'Turn camera on'}
      >
        {isCameraEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        className="min-h-11 rounded-full px-4"
        disabled={leaving || room.state === 'disconnected'}
        onClick={handlePrimaryEnd}
      >
        <Phone className="mr-1.5 h-3.5 w-3.5" />
        {role === 'DOCTOR' ? 'End consultation' : 'Leave call'}
      </Button>
    </div>
  );
}

/** Enable camera/mic only after the LiveKit engine is connected. */
export function LocalTrackPublisher() {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();

  useEffect(() => {
    if (room.state !== ConnectionState.Connected) return;
    void enableLocalMedia(localParticipant, room.state);
  }, [room.state, localParticipant]);

  return null;
}

export function RemoteVideoStage({ label }: { label: string }) {
  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: true });
  const remoteVideo = tracks.find(
    (t) => t.participant.isLocal === false && t.source === Track.Source.Camera
  );

  if (!remoteVideo) {
    return (
      <div className="flex h-full min-h-[180px] items-center justify-center bg-slate-950 text-white/60">
        <p className="text-sm">{label}</p>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-[180px] bg-slate-950">
      <VideoTrack trackRef={remoteVideo} className="h-full w-full object-cover" />
    </div>
  );
}

export function LocalPreviewTile({ className }: { className?: string }) {
  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: true });
  const localVideo = tracks.find((t) => t.participant.isLocal);

  if (!localVideo) return null;

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-white/20 bg-slate-900 shadow-lg',
        className
      )}
    >
      <VideoTrack trackRef={localVideo} className="h-full w-full object-cover mirror-x" />
    </div>
  );
}
