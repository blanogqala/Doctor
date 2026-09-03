'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LetterDocumentActionsMenu, extractEmail } from '@/components/records/letter-document-actions';
import { useToast } from '@/hooks/use-toast';
import { aiApi } from '@/lib/api/ai';
import { cn } from '@/lib/utils';
import { Loader2, Sparkles, Undo2, Wand2 } from 'lucide-react';

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
  disabled?: boolean;
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
  disabled = false,
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

  const urgency =
    urgencyLabelFor(referralMeta.urgency) || referralMeta.urgency || 'ROUTINE';

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
            disabled={busy || disabled}
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
            disabled={busy || disabled}
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
            <LetterDocumentActionsMenu
              letter={letter}
              patientDisplayName={patientDisplayName}
              documentTitle="Referral Letter"
              filenamePrefix="Referral-Letter"
              emailTo={extractEmail(referralMeta.contact)}
              emailSubject={`Referral: ${patientDisplayName} — ${urgency}`}
              referredTo={referralMeta.referred_to}
              urgency={urgencyLabelFor(referralMeta.urgency) || referralMeta.urgency}
              reason={reason || undefined}
              disabled={busy}
            />
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
