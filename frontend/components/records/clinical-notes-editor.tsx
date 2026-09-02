'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Activity, ChevronRight, FileText, Sparkles, Stethoscope } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  GENERAL_APPEARANCES,
  ROS_SYSTEMS,
  calcBMI,
  type ClinicalForm,
} from '@/lib/clinical-form';

export type { ClinicalForm };

interface ClinicalNotesEditorProps {
  value: ClinicalForm;
  onChange: (patch: Partial<ClinicalForm>) => void;
  aiSourcedFields?: Set<string>;
  /** Prefix for checkbox ids when multiple editors could mount */
  idPrefix?: string;
}

function AiSuggestedBadge() {
  return (
    <Badge variant="secondary" className="gap-1 text-[10px] font-normal">
      <Sparkles className="h-3 w-3" />
      AI suggested
    </Badge>
  );
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function VitalInput({
  label,
  value,
  unit,
  onChange,
}: {
  label: string;
  value: string;
  unit: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">
        {label} ({unit})
      </Label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
      />
    </div>
  );
}

function CollapsibleExam({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted/30">
        {label}
        <ChevronRight className={cn('h-4 w-4 transition-transform', open && 'rotate-90')} />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          placeholder="Examination findings..."
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ClinicalNotesEditor({
  value,
  onChange,
  aiSourcedFields = new Set(),
  idPrefix = 'clinical',
}: ClinicalNotesEditorProps) {
  const bmi = calcBMI(value.vitals.weight, value.vitals.height);
  const ai = (field: string) =>
    aiSourcedFields.has(field) ? <AiSuggestedBadge /> : null;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Subjective
        </h3>
        <SectionCard title="Chief Complaint" icon={<FileText className="h-4 w-4" />}>
          <div className="mb-1 flex items-center gap-2">{ai('chief_complaint')}</div>
          <Input
            value={value.chief_complaint}
            onChange={(e) => onChange({ chief_complaint: e.target.value })}
            placeholder="e.g., Chest pain for 2 days"
            aria-label="Chief complaint"
          />
        </SectionCard>

        <SectionCard title="History of Present Illness" icon={<FileText className="h-4 w-4" />}>
          <div className="mb-1 flex items-center gap-2">{ai('history_present_illness')}</div>
          <Textarea
            value={value.history_present_illness}
            onChange={(e) => onChange({ history_present_illness: e.target.value })}
            rows={6}
            aria-label="History of present illness"
            placeholder={
              'Onset: When did it start?\nLocation: Where is the pain/problem?\nDuration: How long does it last?\nCharacter: Describe the sensation (sharp, dull, burning)\nAggravating factors: What makes it worse?\nRelieving factors: What makes it better?\nAssociated symptoms: Any other symptoms?'
            }
          />
        </SectionCard>

        <SectionCard title="Review of Systems" icon={<Activity className="h-4 w-4" />}>
          <div className="mb-2 flex items-center gap-2">{ai('review_of_systems')}</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {ROS_SYSTEMS.map((system) => (
              <div key={system} className="flex items-center space-x-2">
                <Checkbox
                  id={`${idPrefix}-ros-${system}`}
                  checked={!!value.review_of_systems[system]}
                  onCheckedChange={(checked) => {
                    onChange({
                      review_of_systems: {
                        ...value.review_of_systems,
                        [system]: !!checked,
                      },
                    });
                  }}
                />
                <Label
                  htmlFor={`${idPrefix}-ros-${system}`}
                  className="cursor-pointer text-sm font-normal"
                >
                  {system}
                </Label>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Objective
        </h3>
        <SectionCard title="Vital Signs & Examination" icon={<Activity className="h-4 w-4" />}>
          <div className="mb-2 flex items-center gap-2">{ai('vitals')}</div>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
            <VitalInput
              label="BP Systolic"
              value={value.vitals.bp_systolic}
              unit="mmHg"
              onChange={(v) => onChange({ vitals: { ...value.vitals, bp_systolic: v } })}
            />
            <VitalInput
              label="BP Diastolic"
              value={value.vitals.bp_diastolic}
              unit="mmHg"
              onChange={(v) => onChange({ vitals: { ...value.vitals, bp_diastolic: v } })}
            />
            <VitalInput
              label="Heart Rate"
              value={value.vitals.hr}
              unit="bpm"
              onChange={(v) => onChange({ vitals: { ...value.vitals, hr: v } })}
            />
            <VitalInput
              label="Temperature"
              value={value.vitals.temp}
              unit="°C"
              onChange={(v) => onChange({ vitals: { ...value.vitals, temp: v } })}
            />
            <VitalInput
              label="Resp Rate"
              value={value.vitals.rr}
              unit="/min"
              onChange={(v) => onChange({ vitals: { ...value.vitals, rr: v } })}
            />
            <VitalInput
              label="SpO2"
              value={value.vitals.spo2}
              unit="%"
              onChange={(v) => onChange({ vitals: { ...value.vitals, spo2: v } })}
            />
            <VitalInput
              label="Weight"
              value={value.vitals.weight}
              unit="kg"
              onChange={(v) => onChange({ vitals: { ...value.vitals, weight: v } })}
            />
            <VitalInput
              label="Height"
              value={value.vitals.height}
              unit="cm"
              onChange={(v) => onChange({ vitals: { ...value.vitals, height: v } })}
            />
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">BMI (auto)</Label>
              <Input value={bmi} readOnly className="bg-muted/50" aria-label="BMI" />
            </div>
          </div>

          <div className="mb-4 space-y-2">
            <div className="flex items-center gap-2">
              <Label>General Appearance</Label>
              {ai('general_appearance')}
            </div>
            <Select
              value={value.general_appearance || undefined}
              onValueChange={(v) => onChange({ general_appearance: v })}
            >
              <SelectTrigger aria-label="General appearance">
                <SelectValue placeholder="Select appearance..." />
              </SelectTrigger>
              <SelectContent>
                {GENERAL_APPEARANCES.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="mb-1 flex items-center gap-2">{ai('physical_exam_notes')}</div>
          <CollapsibleExam
            label="Physical Examination Notes"
            value={value.physical_exam_notes}
            onChange={(v) => onChange({ physical_exam_notes: v })}
          />
        </SectionCard>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Assessment
        </h3>
        <SectionCard title="Diagnosis & Assessment" icon={<Stethoscope className="h-4 w-4" />}>
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Label className="text-sm" htmlFor={`${idPrefix}-primary-dx`}>
                  Primary Diagnosis
                </Label>
                {ai('primary_diagnosis')}
              </div>
              <Input
                id={`${idPrefix}-primary-dx`}
                value={value.primary_diagnosis}
                onChange={(e) => onChange({ primary_diagnosis: e.target.value })}
                placeholder="e.g., Essential hypertension"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Label className="text-sm" htmlFor={`${idPrefix}-icd10`}>
                    ICD-10 Codes (comma-separated)
                  </Label>
                  {ai('icd10_codes')}
                </div>
                <Input
                  id={`${idPrefix}-icd10`}
                  value={value.icd10_codes}
                  onChange={(e) => onChange({ icd10_codes: e.target.value })}
                  placeholder="e.g., I10, R51"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm">Severity</Label>
                <Select
                  value={value.severity || undefined}
                  onValueChange={(v) => onChange({ severity: v })}
                >
                  <SelectTrigger aria-label="Severity">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MILD">Mild</SelectItem>
                    <SelectItem value="MODERATE">Moderate</SelectItem>
                    <SelectItem value="SEVERE">Severe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-sm" htmlFor={`${idPrefix}-diff-dx`}>
                Differential Diagnoses (comma-separated)
              </Label>
              <Input
                id={`${idPrefix}-diff-dx`}
                value={value.differential_diagnoses}
                onChange={(e) => onChange({ differential_diagnoses: e.target.value })}
                placeholder="e.g., Secondary hypertension, Renal artery stenosis"
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Label className="text-sm" htmlFor={`${idPrefix}-assessment`}>
                  Clinical Assessment
                </Label>
                {ai('assessment')}
              </div>
              <Textarea
                id={`${idPrefix}-assessment`}
                value={value.assessment}
                onChange={(e) => onChange({ assessment: e.target.value })}
                rows={3}
                placeholder="Clinical impression and reasoning..."
              />
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Plan
        </h3>
        <SectionCard title="Treatment & Follow-up" icon={<FileText className="h-4 w-4" />}>
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Label className="text-sm" htmlFor={`${idPrefix}-plan`}>
                  Treatment Plan
                </Label>
                {ai('plan')}
              </div>
              <Textarea
                id={`${idPrefix}-plan`}
                value={value.plan}
                onChange={(e) => onChange({ plan: e.target.value })}
                rows={3}
                placeholder="Treatment plan narrative..."
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Label className="text-sm" htmlFor={`${idPrefix}-lifestyle`}>
                  Lifestyle Advice
                </Label>
                {ai('lifestyle_advice')}
              </div>
              <Textarea
                id={`${idPrefix}-lifestyle`}
                value={value.lifestyle_advice}
                onChange={(e) => onChange({ lifestyle_advice: e.target.value })}
                rows={2}
                placeholder="Diet, exercise, lifestyle recommendations..."
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Label className="text-sm" htmlFor={`${idPrefix}-follow-up`}>
                    Follow-up Date
                  </Label>
                  {ai('follow_up_date')}
                </div>
                <Input
                  id={`${idPrefix}-follow-up`}
                  type="date"
                  value={value.follow_up_date}
                  onChange={(e) => onChange({ follow_up_date: e.target.value })}
                />
              </div>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
