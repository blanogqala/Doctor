'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Mic, Video, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DeviceCheckState = 'idle' | 'checking' | 'ready' | 'error';

export interface DeviceCheckResult {
  camera: boolean;
  microphone: boolean;
  cameraDenied: boolean;
  microphoneDenied: boolean;
  errorMessage?: string;
}

interface PreCallDeviceCheckProps {
  onReady: (result: DeviceCheckResult) => void;
  onCancel?: () => void;
  className?: string;
}

export function PreCallDeviceCheck({ onReady, onCancel, className }: PreCallDeviceCheckProps) {
  const [state, setState] = useState<DeviceCheckState>('idle');
  const [result, setResult] = useState<DeviceCheckResult | null>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopPreview = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopPreview(), [stopPreview]);

  const runCheck = async () => {
    setState('checking');
    stopPreview();

    if (!navigator.mediaDevices?.getUserMedia) {
      const fail: DeviceCheckResult = {
        camera: false,
        microphone: false,
        cameraDenied: false,
        microphoneDenied: false,
        errorMessage: 'This browser does not support camera or microphone access.',
      };
      setResult(fail);
      setState('error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (previewRef.current) {
        previewRef.current.srcObject = stream;
        await previewRef.current.play().catch(() => undefined);
      }
      const next: DeviceCheckResult = {
        camera: stream.getVideoTracks().some((t) => t.enabled),
        microphone: stream.getAudioTracks().some((t) => t.enabled),
        cameraDenied: false,
        microphoneDenied: false,
      };
      setResult(next);
      setState('ready');
    } catch (err) {
      let cameraDenied = false;
      let microphoneDenied = false;
      let errorMessage = 'Could not access your camera or microphone.';

      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          cameraDenied = true;
          microphoneDenied = true;
          errorMessage =
            'Camera or microphone permission was denied. Enable permissions in your browser settings and try again.';
        } else if (err.name === 'NotFoundError') {
          errorMessage = 'No camera or microphone was detected on this device.';
        }
      }

      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        audioOnly.getTracks().forEach((t) => t.stop());
        const partial: DeviceCheckResult = {
          camera: false,
          microphone: true,
          cameraDenied,
          microphoneDenied,
          errorMessage:
            'Microphone is ready. You can join audio-only if your camera is unavailable.',
        };
        setResult(partial);
        setState('ready');
        return;
      } catch {
        // fall through
      }

      setResult({
        camera: false,
        microphone: false,
        cameraDenied,
        microphoneDenied,
        errorMessage,
      });
      setState('error');
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="overflow-hidden rounded-lg border bg-slate-950">
        <video
          ref={previewRef}
          className="aspect-video w-full object-cover mirror-x"
          playsInline
          muted
          aria-label="Camera preview"
        />
        {!result && state === 'idle' && (
          <p className="px-4 py-3 text-center text-sm text-muted-foreground">
            Check your camera and microphone before joining.
          </p>
        )}
      </div>

      {result && (
        <div className="grid gap-2 text-sm">
          <p className="flex items-center gap-2">
            <Video className="h-4 w-4" />
            Camera{' '}
            <span className={result.camera ? 'text-emerald-700' : 'text-amber-700'}>
              {result.camera ? 'Ready' : result.cameraDenied ? 'Permission denied' : 'Unavailable'}
            </span>
          </p>
          <p className="flex items-center gap-2">
            <Mic className="h-4 w-4" />
            Microphone{' '}
            <span className={result.microphone ? 'text-emerald-700' : 'text-amber-700'}>
              {result.microphone
                ? 'Ready'
                : result.microphoneDenied
                  ? 'Permission denied'
                  : 'Unavailable'}
            </span>
          </p>
        </div>
      )}

      {state === 'error' && result?.errorMessage && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{result.errorMessage}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        {state !== 'ready' && (
          <Button onClick={() => void runCheck()} disabled={state === 'checking'}>
            {state === 'checking' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Video className="mr-2 h-4 w-4" />
            )}
            Check camera &amp; microphone
          </Button>
        )}
        {state === 'ready' && result && (
          <Button onClick={() => onReady(result)}>
            Continue
          </Button>
        )}
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
