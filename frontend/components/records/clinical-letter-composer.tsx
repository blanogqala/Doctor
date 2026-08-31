'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, FileText, Loader2, Printer } from 'lucide-react';
import { aiApi } from '@/lib/api/ai';
import { useToast } from '@/hooks/use-toast';
import {
  LetterDocumentActionsMenu,
  buildLetterDocumentHtml,
  openPrintWindow,
} from '@/components/records/letter-document-actions';
import type {
  ClinicalLetterDocumentType,
  ClinicalLetterSaveState,
} from '@/lib/clinical/consultation-save-payload';

export type { ClinicalLetterDocumentType };

export const DOC_LABELS: Record<ClinicalLetterDocumentType, string> = {
  MEDICAL_CERTIFICATE: 'Medical certificate / sick note',
  WORK_ATTENDANCE: 'Work attendance letter',
  SCHOOL_ATTENDANCE: 'School / university attendance letter',
};

interface ClinicalLetterComposerProps {
  patientId: string;
  patientDisplayName: string;
  doctorDisplayName?: string | null;
  practiceName?: string | null;
  consultationDate?: string | null;
  diagnosisText?: string | null;
  value: ClinicalLetterSaveState;
  onChange: (next: ClinicalLetterSaveState) => void;
}

export function ClinicalLetterComposer({
  patientId,
  patientDisplayName,
  doctorDisplayName,
  practiceName,
  consultationDate,
  diagnosisText,
  value,
  onChange,
}: ClinicalLetterComposerProps) {
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);

  const {
    document_type: documentType,
    absence_start: absenceStart,
    absence_end: absenceEnd,
    restrictions,
    include_diagnosis: includeDiagnosis,
    doctor_notes: doctorNotes,
    letter,
    approved,
  } = value;

  const patch = (partial: Partial<ClinicalLetterSaveState>) => {
    onChange({ ...value, ...partial });
  };

  const canGenerate = useMemo(() => {
    if (documentType === 'MEDICAL_CERTIFICATE') {
      return Boolean(absenceStart && absenceEnd);
    }
    return true;
  }, [documentType, absenceStart, absenceEnd]);

  const handleGenerate = async () => {
    if (!canGenerate) {
      toast({
        title: 'Absence dates required',
        description: 'Provide doctor-approved absence start and end dates before generating a certificate draft.',
        variant: 'destructive',
      });
      return;
    }
    setGenerating(true);
    patch({ approved: false });
    try {
      const res = await aiApi.clinicalLetterDraft({
        patient_id: patientId,
        document_type: documentType,
        patient_display_name: patientDisplayName,
        doctor_display_name: doctorDisplayName ?? null,
        practice_name: practiceName ?? null,
        letter_date: consultationDate ?? new Date().toISOString().slice(0, 10),
        absence_start: absenceStart || null,
        absence_end: absenceEnd || null,
        restrictions: restrictions || null,
        include_diagnosis: includeDiagnosis,
        diagnosis_text: includeDiagnosis ? diagnosisText ?? null : null,
        doctor_notes: doctorNotes || null,
      });
      onChange({ ...value, letter: res.letter, approved: false });
      toast({
        title: 'Draft ready for review',
        description: 'AI created a draft. Edit as needed, then Approve document before printing. Save the record to keep this letter.',
      });
    } catch (err) {
      toast({
        title: 'Could not generate draft',
        description: err instanceof Error ? err.message : 'Try again',
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleApprove = () => {
    if (!letter.trim()) return;
    patch({ approved: true });
    toast({
      title: 'Document approved',
      description: 'You may print or copy this letter. Save the record to keep it on the patient folder.',
    });
  };

  const handlePrint = () => {
    if (!approved) {
      toast({
        title: 'Approve first',
        description: 'Approve the document before printing.',
        variant: 'destructive',
      });
      return;
    }
    if (!letter.trim()) return;
    try {
      openPrintWindow(
        buildLetterDocumentHtml({
          documentTitle: DOC_LABELS[documentType],
          patientDisplayName,
          letter,
        })
      );
    } catch (err) {
      toast({
        title: 'Print failed',
        description: err instanceof Error ? err.message : 'Could not open print view',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          AI Clinical Assistant creates a <strong className="font-medium text-foreground">draft</strong> only.
          You choose absence dates and restrictions. Approve document before print. Use{' '}
          <strong className="font-medium text-foreground">Save Changes</strong> to keep the letter on this
          consultation.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {(Object.keys(DOC_LABELS) as ClinicalLetterDocumentType[]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => patch({ document_type: type, approved: false })}
            className={`rounded-md border px-3 py-2 text-left text-sm ${
              documentType === type
                ? 'border-foreground bg-muted'
                : 'border-border hover:bg-muted/40'
            }`}
          >
            {DOC_LABELS[type]}
          </button>
        ))}
      </div>

      {documentType === 'MEDICAL_CERTIFICATE' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="absence-start">Absence from (doctor decision)</Label>
            <Input
              id="absence-start"
              type="date"
              value={absenceStart}
              onChange={(e) => patch({ absence_start: e.target.value, approved: false })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="absence-end">Absence until (doctor decision)</Label>
            <Input
              id="absence-end"
              type="date"
              value={absenceEnd}
              onChange={(e) => patch({ absence_end: e.target.value, approved: false })}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="restrictions">Restrictions (optional)</Label>
            <Input
              id="restrictions"
              value={restrictions}
              onChange={(e) => patch({ restrictions: e.target.value, approved: false })}
              placeholder="e.g. Light duties only"
            />
          </div>
        </div>
      )}

      <div className="flex items-start space-x-3">
        <Checkbox
          id="include-dx"
          checked={includeDiagnosis}
          onCheckedChange={(v) => patch({ include_diagnosis: !!v, approved: false })}
        />
        <Label htmlFor="include-dx" className="text-sm font-normal leading-snug">
          Include diagnosis in the letter (only if clinically and legally appropriate)
        </Label>
      </div>

      <div className="space-y-1">
        <Label htmlFor="letter-notes">Additional instructions for the draft</Label>
        <Textarea
          id="letter-notes"
          value={doctorNotes}
          onChange={(e) => patch({ doctor_notes: e.target.value, approved: false })}
          rows={2}
          placeholder="Optional context for wording only — AI will not invent clinical facts"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void handleGenerate()} disabled={generating || !canGenerate}>
          {generating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating draft…
            </>
          ) : (
            <>
              <FileText className="mr-2 h-4 w-4" />
              Generate draft
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={handleApprove}
          disabled={!letter.trim() || approved}
        >
          Approve document
        </Button>
        <Button type="button" variant="outline" onClick={handlePrint} disabled={!approved}>
          <Printer className="mr-2 h-4 w-4" />
          Print
        </Button>
      </div>

      {letter && (
        <div className="overflow-hidden rounded-lg border bg-background">
          <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5">
            <Label htmlFor="letter-body" className="flex-1 text-sm">
              Draft letter {approved ? '(approved)' : '(edit before approve)'}
            </Label>
            <LetterDocumentActionsMenu
              letter={letter}
              patientDisplayName={patientDisplayName}
              documentTitle={DOC_LABELS[documentType]}
              filenamePrefix="Clinical-Letter"
              emailSubject={`${DOC_LABELS[documentType]}: ${patientDisplayName}`}
              requireApproved
              approved={approved}
            />
          </div>
          <Textarea
            id="letter-body"
            value={letter}
            onChange={(e) => patch({ letter: e.target.value, approved: false })}
            rows={12}
            className="rounded-none border-0 font-serif text-sm focus-visible:ring-0"
          />
        </div>
      )}
    </div>
  );
}
