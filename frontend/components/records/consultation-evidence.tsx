'use client';

import { useEffect, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, FileText, Headphones, Loader2 } from 'lucide-react';
import { medicalRecordsApi } from '@/lib/api/medical-records';
import { formatDate } from '@/lib/format';
import type { MedicalRecord } from '@/lib/types';

interface ConsultationEvidenceProps {
  record: MedicalRecord;
}

export function ConsultationEvidence({ record }: ConsultationEvidenceProps) {
  const hasAudio = !!record.has_scribe_recording;
  const transcript = record.scribe_transcript?.trim() || '';
  const warnings = Array.isArray(record.scribe_warnings) ? record.scribe_warnings : [];

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  useEffect(() => {
    if (!hasAudio) return;
    let revoked: string | null = null;
    let cancelled = false;

    setAudioLoading(true);
    setAudioError(null);

    medicalRecordsApi
      .fetchConsultationAudioObjectUrl(record.id)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        revoked = url;
        setAudioUrl(url);
      })
      .catch((err) => {
        if (!cancelled) {
          setAudioError(err instanceof Error ? err.message : 'Could not load audio');
        }
      })
      .finally(() => {
        if (!cancelled) setAudioLoading(false);
      });

    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [hasAudio, record.id]);

  if (!hasAudio && !transcript) return null;

  return (
    <>
      <Card className="border-primary/20 bg-primary/[0.03]">
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
            <Headphones className="h-4 w-4 text-primary" />
            Consultation Transcript
            <Badge variant="secondary" className="text-[10px] font-normal">
              Doctor only
            </Badge>
            {record.scribe_status && (
              <Badge variant="outline" className="text-[10px] font-normal">
                {record.scribe_status === 'READY'
                  ? 'Ready'
                  : record.scribe_status === 'FAILED'
                    ? 'Failed'
                    : 'Processing'}
              </Badge>
            )}
            {record.scribe_recorded_at && (
              <span className="text-xs font-normal text-muted-foreground">
                Recorded {formatDate(record.scribe_recorded_at, true)}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            AI-generated transcription. Review against the consultation if needed. Secondary to the
            clinical record — not a substitute for the doctor&apos;s finalized note.
          </p>          {hasAudio && (
            <div className="space-y-2">
              {audioLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading audio…
                </div>
              )}
              {audioError && (
                <p className="text-sm text-destructive">{audioError}</p>
              )}
              {audioUrl && (
                <audio controls className="w-full" src={audioUrl} preload="metadata">
                  Your browser does not support audio playback.
                </audio>
              )}
            </div>
          )}

          {transcript && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setTranscriptOpen(true)}>
                <FileText className="mr-2 h-4 w-4" />
                View AI Transcript
              </Button>
              {record.scribe_detected_language && (
                <Badge variant="outline" className="text-xs font-normal">
                  Language: {record.scribe_detected_language}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={transcriptOpen} onOpenChange={setTranscriptOpen}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-lg">
          <SheetHeader className="text-left">
            <SheetTitle>Consultation transcript</SheetTitle>
            <SheetDescription>
              AI-generated transcription. Review against the consultation if needed. Retained with
              this record for doctor reference only — not shown to patients or reception.
            </SheetDescription>
          </SheetHeader>

          {warnings.length > 0 && (
            <div className="mt-3 space-y-1 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {warnings.map((w) => (
                <div key={w} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-md border bg-muted/30 p-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {transcript || 'No transcript available.'}
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
