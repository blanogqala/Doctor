'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { AlertTriangle, Check, Pencil, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ScribeSuggestions, ScribeConfidenceScores } from '@/lib/api/ai';

export type ScribeFieldKey =
  | 'chief_complaint'
  | 'history_present_illness'
  | 'vitals'
  | 'general_appearance'
  | 'physical_exam_notes'
  | 'primary_diagnosis'
  | 'icd10_codes'
  | 'differential_diagnoses'
  | 'severity'
  | 'assessment'
  | 'plan'
  | 'lifestyle_advice'
  | 'follow_up_date'
  | 'review_of_systems';

type FieldDecision = 'pending' | 'accepted' | 'ignored';

interface FieldDef {
  key: ScribeFieldKey;
  label: string;
  multiline?: boolean;
}

const FIELDS: FieldDef[] = [
  { key: 'chief_complaint', label: 'Chief Complaint' },
  { key: 'history_present_illness', label: 'History of Present Illness', multiline: true },
  { key: 'vitals', label: 'Vital Signs' },
  { key: 'review_of_systems', label: 'Review of Systems' },
  { key: 'general_appearance', label: 'General Appearance' },
  { key: 'physical_exam_notes', label: 'Physical Examination', multiline: true },
  { key: 'primary_diagnosis', label: 'Primary Diagnosis' },
  { key: 'icd10_codes', label: 'ICD-10 Codes' },
  { key: 'differential_diagnoses', label: 'Differential Diagnoses', multiline: true },
  { key: 'severity', label: 'Severity' },
  { key: 'assessment', label: 'Assessment', multiline: true },
  { key: 'plan', label: 'Plan', multiline: true },
  { key: 'lifestyle_advice', label: 'Lifestyle Advice', multiline: true },
  { key: 'follow_up_date', label: 'Follow-up Date' },
];

function formatSuggestion(key: ScribeFieldKey, suggestions: ScribeSuggestions): string {
  if (key === 'vitals') {
    const v = suggestions.vitals;
    if (!v) return '';
    const parts = [
      v.bp_systolic || v.bp_diastolic
        ? `BP ${v.bp_systolic ?? '—'}/${v.bp_diastolic ?? '—'}`
        : null,
      v.hr ? `HR ${v.hr}` : null,
      v.temp ? `Temp ${v.temp}` : null,
      v.rr ? `RR ${v.rr}` : null,
      v.spo2 ? `SpO2 ${v.spo2}` : null,
      v.weight ? `Wt ${v.weight}` : null,
      v.height ? `Ht ${v.height}` : null,
    ].filter(Boolean);
    return parts.join(' · ');
  }
  if (key === 'review_of_systems') {
    const ros = suggestions.review_of_systems ?? {};
    const positive = Object.entries(ros)
      .filter(([, on]) => on)
      .map(([name]) => name);
    return positive.length ? positive.join(', ') : '';
  }
  const value = suggestions[key];
  return typeof value === 'string' ? value : '';
}

function hasContent(key: ScribeFieldKey, suggestions: ScribeSuggestions): boolean {
  return formatSuggestion(key, suggestions).trim().length > 0;
}

interface ScribeReviewPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transcript: string;
  detectedLanguage: string | null;
  suggestions: ScribeSuggestions;
  confidenceScores: ScribeConfidenceScores;
  warnings: string[];
  onApplyAccepted: (accepted: Partial<ScribeSuggestions>, acceptedKeys: ScribeFieldKey[]) => void;
  onDiscardAll: () => void;
  onReRecord: () => void;
}

export function ScribeReviewPanel({
  open,
  onOpenChange,
  transcript,
  detectedLanguage,
  suggestions,
  confidenceScores,
  warnings,
  onApplyAccepted,
  onDiscardAll,
  onReRecord,
}: ScribeReviewPanelProps) {
  const [decisions, setDecisions] = useState<Record<string, FieldDecision>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const visibleFields = useMemo(
    () => FIELDS.filter((f) => hasContent(f.key, suggestions)),
    [suggestions]
  );

  useEffect(() => {
    if (!open) return;
    const next: Record<string, FieldDecision> = {};
    for (const f of FIELDS) {
      if (hasContent(f.key, suggestions)) next[f.key] = 'pending';
    }
    setDecisions(next);
    setEdits({});
    setEditingKey(null);
  }, [open, suggestions]);

  const setDecision = (key: string, decision: FieldDecision) => {
    setDecisions((prev) => ({ ...prev, [key]: decision }));
    if (decision !== 'pending') setEditingKey(null);
  };

  const handleApply = () => {
    const acceptedKeys = visibleFields
      .filter((f) => decisions[f.key] === 'accepted')
      .map((f) => f.key);

    const accepted: Partial<ScribeSuggestions> = {};
    for (const key of acceptedKeys) {
      if (key === 'vitals') {
        accepted.vitals = suggestions.vitals;
      } else if (key === 'review_of_systems') {
        accepted.review_of_systems = suggestions.review_of_systems;
      } else {
        const edited = edits[key];
        accepted[key] = (edited !== undefined ? edited : suggestions[key]) as string;
      }
    }
    onApplyAccepted(accepted, acceptedKeys);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        <SheetHeader className="border-b px-6 py-4 text-left">
          <SheetTitle>AI Clinical Assistant</SheetTitle>
          <SheetDescription>
            Review AI-assisted draft — accept, edit, or ignore each field before applying.
            {detectedLanguage ? ` Detected language: ${detectedLanguage}.` : ''}
          </SheetDescription>
        </SheetHeader>

        {warnings.length > 0 && (
          <div className="mx-6 mt-3 space-y-1 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {warnings.map((w) => (
              <div key={w} className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden md:grid-cols-2">
          <div className="min-h-0 overflow-y-auto border-b p-4 md:border-b-0 md:border-r">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              English transcript
            </p>
            <p className="mb-2 text-xs text-muted-foreground">
              AI-generated transcription. Review against the consultation if needed.
            </p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {transcript || 'No transcript available.'}
            </p>
          </div>

          <div className="min-h-0 space-y-3 overflow-y-auto p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Suggested field mappings
            </p>
            {visibleFields.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No structured suggestions extracted. You can re-record or enter notes manually.
              </p>
            )}
            {visibleFields.map((field) => {
              const confidence = confidenceScores[field.key] ?? 0.5;
              const high = confidence >= 0.75;
              const decision = decisions[field.key] ?? 'pending';
              const display =
                edits[field.key] !== undefined
                  ? edits[field.key]
                  : formatSuggestion(field.key, suggestions);
              const isEditing = editingKey === field.key;
              const canEditText =
                field.key !== 'vitals' && field.key !== 'review_of_systems';

              return (
                <div
                  key={field.key}
                  className={cn(
                    'rounded-md border p-3',
                    high ? 'border-emerald-300' : 'border-amber-300',
                    decision === 'accepted' && 'bg-emerald-50/50',
                    decision === 'ignored' && 'opacity-60'
                  )}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{field.label}</span>
                    {!high && (
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <AlertTriangle className="h-3 w-3" />
                        Needs review
                      </Badge>
                    )}
                    {decision === 'accepted' && (
                      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                        Accepted
                      </Badge>
                    )}
                    {decision === 'ignored' && <Badge variant="outline">Ignored</Badge>}
                  </div>

                  {isEditing && canEditText ? (
                    field.multiline ? (
                      <Textarea
                        value={display}
                        onChange={(e) =>
                          setEdits((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        rows={4}
                        className="mb-2"
                      />
                    ) : (
                      <Input
                        value={display}
                        onChange={(e) =>
                          setEdits((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        className="mb-2"
                      />
                    )
                  ) : (
                    <p className="mb-2 whitespace-pre-wrap text-sm text-slate-700">{display}</p>
                  )}

                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant={decision === 'accepted' ? 'default' : 'outline'}
                      onClick={() => setDecision(field.key, 'accepted')}
                    >
                      <Check className="mr-1 h-3.5 w-3.5" />
                      Accept
                    </Button>
                    {canEditText && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingKey(field.key);
                          if (edits[field.key] === undefined) {
                            setEdits((prev) => ({
                              ...prev,
                              [field.key]: formatSuggestion(field.key, suggestions),
                            }));
                          }
                          setDecision(field.key, 'accepted');
                        }}
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" />
                        Edit
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setDecision(field.key, 'ignored')}
                    >
                      <X className="mr-1 h-3.5 w-3.5" />
                      Ignore
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <SheetFooter className="flex-row flex-wrap gap-2 border-t px-6 py-4 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={onDiscardAll}>
              Discard All
            </Button>
            <Button type="button" variant="outline" onClick={onReRecord}>
              Re-record
            </Button>
          </div>
          <Button type="button" onClick={handleApply}>
            Apply All Accepted
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
