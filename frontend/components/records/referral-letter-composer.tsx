'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { aiApi } from '@/lib/api/ai';
import { cn } from '@/lib/utils';
import {
  Copy,
  FileDown,
  FileText,
  Loader2,
  Mail,
  MoreHorizontal,
  Printer,
  Sparkles,
  Undo2,
  Wand2,
} from 'lucide-react';

const MAILTO_SAFE_LEN = 1800;

const URGENCY_LABELS: Record<string, string> = {
  ROUTINE: 'Routine — within 2–4 weeks',
  URGENT: 'Urgent — within 24–48 hours',
};

function urgencyLabelFor(code?: string): string | null {
  if (!code) return null;
  return URGENCY_LABELS[code] || code;
}

export interface ReferralLetterClinicalContext {
  chief_complaint?: string;
  history_present_illness?: string;
  assessment?: string;
  plan?: string;
  primary_diagnosis?: string;
  physical_exam_notes?: string;
  medications_summary?: string;
  severity?: string;
  general_appearance?: string;
  differential_diagnoses?: string;
  vitals_summary?: string;
  positive_ros_summary?: string;
  investigations_summary?: string;
}

export interface ReferralLetterMeta {
  referred_to?: string;
  specialty?: string;
  institution?: string;
  contact?: string;
  reason?: string;
  urgency?: string;
  specific_questions?: string;
}

export interface ReferralLetterReferringDoctor {
  fullName?: string;
  practiceName?: string;
  specialization?: string;
  phone?: string;
  email?: string;
  hpcsa?: string;
}

export interface ReferralLetterPatientContext {
  displayName: string;
  dateOfBirthOrAge?: string | null;
  gender?: string | null;
  phone?: string | null;
  email?: string | null;
  addressLine?: string | null;
  allergies?: string | null;
  medicalHistory?: string | null;
}

export interface ReferralLetterComposerProps {
  reason: string;
  letter: string;
  onReasonChange: (value: string) => void;
  onLetterChange: (value: string) => void;
  patientId: string;
  patientDisplayName: string;
  ageOrDobHint?: string | null;
  gender?: string | null;
  clinical: ReferralLetterClinicalContext;
  referralMeta: ReferralLetterMeta;
  referringDoctor?: ReferralLetterReferringDoctor;
  patientContext?: ReferralLetterPatientContext;
  className?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildLetterDocumentHtml(params: {
  patientDisplayName: string;
  referredTo?: string;
  urgency?: string;
  reason?: string;
  letter: string;
}): string {
  const body = escapeHtml(params.letter).replace(/\n/g, '<br/>');
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Referral Letter — ${escapeHtml(params.patientDisplayName)}</title>
  <style>
    body { font-family: Georgia, 'Times New Roman', serif; color: #111; max-width: 720px; margin: 40px auto; padding: 0 24px; line-height: 1.55; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    .meta { color: #444; font-size: 13px; margin-bottom: 24px; }
    .letter { white-space: pre-wrap; font-size: 14px; }
    @media print { body { margin: 16px; } }
  </style>
</head>
<body>
  <h1>Referral Letter</h1>
  <div class="meta">
    <div><strong>Patient:</strong> ${escapeHtml(params.patientDisplayName)}</div>
    ${params.referredTo ? `<div><strong>Referred to:</strong> ${escapeHtml(params.referredTo)}</div>` : ''}
    ${params.urgency ? `<div><strong>Urgency:</strong> ${escapeHtml(params.urgency)}</div>` : ''}
    ${params.reason ? `<div><strong>Subject:</strong> ${escapeHtml(params.reason)}</div>` : ''}
  </div>
  <div class="letter">${body}</div>
</body>
</html>`;
}

function openPrintWindow(html: string) {
  const win = window.open('', '_blank', 'noopener,noreferrer,width=800,height=900');
  if (!win) {
    throw new Error('Pop-up blocked. Allow pop-ups to print or export PDF.');
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 250);
}

function downloadWordDoc(params: {
  patientDisplayName: string;
  referredTo?: string;
  urgency?: string;
  reason?: string;
  letter: string;
}) {
  const paragraphs = escapeHtml(params.letter)
    .split(/\n/)
    .map((line) => `<p>${line || '&nbsp;'}</p>`)
    .join('');

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>Referral Letter</title></head>
<body>
  <h2>Referral Letter</h2>
  <p><strong>Patient:</strong> ${escapeHtml(params.patientDisplayName)}</p>
  ${params.referredTo ? `<p><strong>Referred to:</strong> ${escapeHtml(params.referredTo)}</p>` : ''}
  ${params.urgency ? `<p><strong>Urgency:</strong> ${escapeHtml(params.urgency)}</p>` : ''}
  ${params.reason ? `<p><strong>Subject:</strong> ${escapeHtml(params.reason)}</p>` : ''}
  <hr/>
  ${paragraphs}
</body>
</html>`;

  const blob = new Blob(['\ufeff', html], {
    type: 'application/msword',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = params.patientDisplayName.replace(/[^\w\- ]+/g, '').trim() || 'Patient';
  a.href = url;
  a.download = `Referral-Letter-${safeName}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function extractEmail(contact?: string): string {
  if (!contact) return '';
  const match = contact.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : '';
}

export function ReferralLetterComposer({
  reason,
  letter,
  onReasonChange,
  onLetterChange,
  patientId,
  patientDisplayName,
  ageOrDobHint,
  gender,
  clinical,
  referralMeta,
  referringDoctor,
  patientContext,
  className,
}: ReferralLetterComposerProps) {
  const { toast } = useToast();
  const [enhancing, setEnhancing] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const previousLetterRef = useRef<string | null>(null);
  const [canRevert, setCanRevert] = useState(false);

  const busy = enhancing || drafting;

  const rememberPrevious = (current: string) => {
    previousLetterRef.current = current;
    setCanRevert(true);
  };

  const handleRevert = () => {
    if (previousLetterRef.current == null) return;
    onLetterChange(previousLetterRef.current);
    previousLetterRef.current = null;
    setCanRevert(false);
  };

  const handleAuto = async () => {
    if (!letter.trim()) {
      toast({
        title: 'Nothing to polish',
        description: 'Write a letter first, or use AI to draft one.',
        variant: 'destructive',
      });
      return;
    }
    setEnhancing(true);
    try {
      rememberPrevious(letter);
      const res = await aiApi.referralEnhance({ letter, patientId });
      onLetterChange(res.letter);
      toast({ title: 'Letter polished', description: 'Review the Auto result before sending.' });
    } catch (err) {
      toast({
        title: 'Auto failed',
        description: err instanceof Error ? err.message : 'Could not enhance letter',
        variant: 'destructive',
      });
    } finally {
      setEnhancing(false);
    }
  };

  const handleAiDraft = async () => {
    setDrafting(true);
    try {
      rememberPrevious(letter);
      const res = await aiApi.referralDraft({
        patientId,
        patientDisplayName,
        letterDate: new Date().toLocaleDateString('en-ZA', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        ageOrDobHint: ageOrDobHint || null,
        gender: gender || null,
        referringDoctor: referringDoctor
          ? {
              fullName: referringDoctor.fullName || null,
              practiceName: referringDoctor.practiceName || null,
              specialization: referringDoctor.specialization || null,
              phone: referringDoctor.phone || null,
              email: referringDoctor.email || null,
              hpcsa: referringDoctor.hpcsa || null,
            }
          : null,
        patient: {
          displayName: patientContext?.displayName || patientDisplayName,
          dateOfBirthOrAge:
            patientContext?.dateOfBirthOrAge || ageOrDobHint || null,
          gender: patientContext?.gender || gender || null,
          phone: patientContext?.phone || null,
          email: patientContext?.email || null,
          addressLine: patientContext?.addressLine || null,
          allergies: patientContext?.allergies || null,
          medicalHistory: patientContext?.medicalHistory || null,
        },
        clinical: {
          chief_complaint: clinical.chief_complaint || null,
          history_present_illness: clinical.history_present_illness || null,
          assessment: clinical.assessment || null,
          plan: clinical.plan || null,
          primary_diagnosis: clinical.primary_diagnosis || null,
          physical_exam_notes: clinical.physical_exam_notes || null,
          medications_summary: clinical.medications_summary || null,
          severity: clinical.severity || null,
          general_appearance: clinical.general_appearance || null,
          differential_diagnoses: clinical.differential_diagnoses || null,
          vitals_summary: clinical.vitals_summary || null,
          positive_ros_summary: clinical.positive_ros_summary || null,
          investigations_summary: clinical.investigations_summary || null,
        },
        referral: {
          referred_to: referralMeta.referred_to || null,
          specialty: referralMeta.specialty || null,
          institution: referralMeta.institution || null,
          contact: referralMeta.contact || null,
          reason: reason || referralMeta.reason || null,
          urgency: referralMeta.urgency || null,
          urgencyLabel: urgencyLabelFor(referralMeta.urgency),
          specific_questions: referralMeta.specific_questions || null,
        },
      });
      onLetterChange(res.letter);
      toast({ title: 'Draft ready', description: 'Review and edit the AI letter before sending.' });
    } catch (err) {
      toast({
        title: 'AI draft failed',
        description: err instanceof Error ? err.message : 'Could not draft letter',
        variant: 'destructive',
      });
    } finally {
      setDrafting(false);
    }
  };

  const handleCopy = async () => {
    if (!letter.trim()) {
      toast({ title: 'Nothing to copy', variant: 'destructive' });
      return;
    }
    try {
      await navigator.clipboard.writeText(letter);
      toast({ title: 'Copied', description: 'Referral letter copied to clipboard.' });
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Clipboard access was denied.',
        variant: 'destructive',
      });
    }
  };

  const handleMailto = () => {
    if (!letter.trim()) {
      toast({ title: 'Nothing to email', variant: 'destructive' });
      return;
    }
    const to = extractEmail(referralMeta.contact);
    const urgency =
      urgencyLabelFor(referralMeta.urgency) || referralMeta.urgency || 'ROUTINE';
    const subject = `Referral: ${patientDisplayName} — ${urgency}`;
    let body = letter;
    if (body.length > MAILTO_SAFE_LEN) {
      body = `${body.slice(0, MAILTO_SAFE_LEN)}\n\n[Letter truncated for email — use Copy all text for the full letter.]`;
      toast({
        title: 'Letter truncated for email',
        description: 'Use Copy all text if the specialist needs the full body.',
      });
    }
    const href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
  };

  const letterHtml = () =>
    buildLetterDocumentHtml({
      patientDisplayName,
      referredTo: referralMeta.referred_to,
      urgency: urgencyLabelFor(referralMeta.urgency) || referralMeta.urgency,
      reason: reason || undefined,
      letter,
    });

  const handlePrint = () => {
    if (!letter.trim()) {
      toast({ title: 'Nothing to print', variant: 'destructive' });
      return;
    }
    try {
      openPrintWindow(letterHtml());
    } catch (err) {
      toast({
        title: 'Print failed',
        description: err instanceof Error ? err.message : 'Could not open print view',
        variant: 'destructive',
      });
    }
  };

  const handleExportPdf = () => {
    if (!letter.trim()) {
      toast({ title: 'Nothing to export', variant: 'destructive' });
      return;
    }
    try {
      openPrintWindow(letterHtml());
      toast({
        title: 'Save as PDF',
        description: 'In the print dialog, choose “Save as PDF” or “Microsoft Print to PDF”.',
      });
    } catch (err) {
      toast({
        title: 'Export failed',
        description: err instanceof Error ? err.message : 'Could not open print view',
        variant: 'destructive',
      });
    }
  };

  const handleExportWord = () => {
    if (!letter.trim()) {
      toast({ title: 'Nothing to export', variant: 'destructive' });
      return;
    }
    try {
      downloadWordDoc({
        patientDisplayName,
        referredTo: referralMeta.referred_to,
        urgency: urgencyLabelFor(referralMeta.urgency) || referralMeta.urgency,
        reason: reason || undefined,
        letter,
      });
      toast({ title: 'Word download started' });
    } catch (err) {
      toast({
        title: 'Export failed',
        description: err instanceof Error ? err.message : 'Could not download Word file',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div className="space-y-1">
        <Label className="text-sm">Subject / reason (optional)</Label>
        <Input
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder="e.g., Evaluation of chest pain"
        />
      </div>

      <div className="overflow-hidden rounded-lg border bg-background">
        <div className="flex flex-wrap items-center gap-1 border-b bg-muted/40 px-2 py-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5"
            disabled={busy}
            onClick={handleAuto}
          >
            {enhancing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="h-3.5 w-3.5" />
            )}
            Auto
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5"
            disabled={busy}
            onClick={handleAiDraft}
          >
            {drafting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            AI
          </Button>
          {canRevert && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5"
              disabled={busy}
              onClick={handleRevert}
            >
              <Undo2 className="h-3.5 w-3.5" />
              Undo
            </Button>
          )}
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={busy}>
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">More</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={handleCopy}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy all text
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleMailto}>
                  <Mail className="mr-2 h-4 w-4" />
                  Email to
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handlePrint}>
                  <Printer className="mr-2 h-4 w-4" />
                  Print
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <FileDown className="mr-2 h-4 w-4" />
                    Export as
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={handleExportPdf}>
                      <FileText className="mr-2 h-4 w-4" />
                      PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportWord}>
                      <FileText className="mr-2 h-4 w-4" />
                      Word
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <Textarea
          value={letter}
          onChange={(e) => {
            onLetterChange(e.target.value);
            if (canRevert) setCanRevert(false);
          }}
          rows={14}
          className="min-h-[280px] resize-y rounded-none border-0 focus-visible:ring-0"
          placeholder="Write or generate the referral letter here…"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Auto polishes your wording. AI drafts a formal referral letter from clinical notes, urgency,
        and referral details (letterhead and patient contact when available; ID and private notes are
        not sent).
      </p>
    </div>
  );
}
