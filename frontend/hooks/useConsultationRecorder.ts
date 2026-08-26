'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_BYTES = 25 * 1024 * 1024;

function pickMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return 'audio/webm';
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function useConsultationRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeTypeRef = useRef('audio/webm');

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    return () => {
      clearTimer();
      stopTracks();
      if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
        try {
          mediaRecorder.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    chunks.current = [];
    setDuration(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      mimeTypeRef.current = mimeType;

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorder.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };

      recorder.start(1000);
      setIsRecording(true);
      clearTimer();
      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } catch (err) {
      stopTracks();
      const message =
        err instanceof Error ? err.message : 'Microphone access denied or unavailable';
      setError(message);
      throw new Error(message);
    }
  }, []);

  const stopRecording = useCallback((): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const recorder = mediaRecorder.current;
      if (!recorder || recorder.state === 'inactive') {
        clearTimer();
        setIsRecording(false);
        stopTracks();
        reject(new Error('No active recording'));
        return;
      }

      recorder.onstop = () => {
        clearTimer();
        setIsRecording(false);
        stopTracks();
        const blob = new Blob(chunks.current, { type: mimeTypeRef.current });
        chunks.current = [];
        if (blob.size > MAX_BYTES) {
          reject(
            new Error(
              'Recording exceeds 25MB. Stop earlier or speak closer to the mic with quieter settings.'
            )
          );
          return;
        }
        if (blob.size === 0) {
          reject(new Error('Recording was empty. Please try again.'));
          return;
        }
        resolve(blob);
      };

      try {
        recorder.stop();
      } catch (err) {
        clearTimer();
        setIsRecording(false);
        stopTracks();
        reject(err instanceof Error ? err : new Error('Failed to stop recording'));
      }
    });
  }, []);

  const cancelRecording = useCallback(() => {
    clearTimer();
    setIsRecording(false);
    setDuration(0);
    chunks.current = [];
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      try {
        mediaRecorder.current.onstop = null;
        mediaRecorder.current.stop();
      } catch {
        // ignore
      }
    }
    stopTracks();
    mediaRecorder.current = null;
  }, []);

  return {
    isRecording,
    duration,
    formattedDuration: formatDuration(duration),
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    maxBytes: MAX_BYTES,
  };
}
