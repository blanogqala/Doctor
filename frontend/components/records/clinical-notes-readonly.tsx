'use client';

import { Badge } from '@/components/ui/badge';
import type { MedicalRecord } from '@/lib/types';
import { formatDate } from '@/lib/format';
import { ClinicalField, ClinicalSection } from '@/components/records/clinical-section';
import { VitalSignsDisplay } from '@/components/records/vital-signs-display';

function hasRos(ros: MedicalRecord['review_of_systems']): string[] {
  if (!ros) return [];
  return Object.entries(ros)
    .filter(([, v]) => v)
    .map(([k]) => k);
}

export function ClinicalNotesReadOnly({ record }: { record: MedicalRecord }) {
  const vitals = record.vital_signs;
  const peNotes =
    record.physical_examination && typeof record.physical_examination === 'object'
      ? (record.physical_examination as Record<string, string>).notes
      : null;
  const rosPositive = hasRos(record.review_of_systems);

  const hasSubjective = Boolean(
    record.chief_complaint ||
      record.subjective ||
      record.history_present_illness ||
      rosPositive.length
  );
  const hasObjective = Boolean(
    vitals && Object.values(vitals).some((x) => x != null) ||
      record.general_appearance ||
      peNotes ||
      record.objective
  );
  const hasAssessment = Boolean(
    record.primary_diagnosis ||
      (record.differential_diagnoses && record.differential_diagnoses.length) ||
      record.severity ||
      record.assessment ||
      (record.diagnosis_codes && record.diagnosis_codes.length)
  );
  const hasPlan = Boolean(record.plan || record.lifestyle_advice || record.follow_up_date);

  if (!hasSubjective && !hasObjective && !hasAssessment && !hasPlan) {
    return (
      <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
        No clinical content recorded for this consultation.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {hasSubjective && (
        <ClinicalSection title="Subjective">
          <ClinicalField label="Chief Complaint">
            {record.chief_complaint || record.subjective}
          </ClinicalField>
          <ClinicalField label="History of Present Illness">
            {record.history_present_illness}
          </ClinicalField>
          {rosPositive.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Review of Systems</p>
              <div className="flex flex-wrap gap-1.5">
                {rosPositive.map((s) => (
                  <Badge key={s} variant="secondary">
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </ClinicalSection>
      )}

      {hasObjective && (
        <ClinicalSection title="Objective">
          <VitalSignsDisplay vitals={vitals} />
          <ClinicalField label="General Appearance">{record.general_appearance}</ClinicalField>
          <ClinicalField label="Physical Examination">{peNotes || record.objective}</ClinicalField>
        </ClinicalSection>
      )}

      {hasAssessment && (
        <ClinicalSection title="Assessment">
          <ClinicalField label="Diagnosis">{record.primary_diagnosis}</ClinicalField>
          {record.diagnosis_codes && record.diagnosis_codes.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">ICD-10</p>
              <div className="flex flex-wrap gap-1.5">
                {record.diagnosis_codes.map((code) => (
                  <Badge key={code} variant="outline">
                    {code}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {record.differential_diagnoses && record.differential_diagnoses.length > 0 && (
            <ClinicalField label="Differential Diagnosis">
              {record.differential_diagnoses.join(', ')}
            </ClinicalField>
          )}
          <ClinicalField label="Severity">{record.severity}</ClinicalField>
          <ClinicalField label="Assessment">{record.assessment}</ClinicalField>
        </ClinicalSection>
      )}

      {hasPlan && (
        <ClinicalSection title="Plan">
          <ClinicalField label="Treatment Plan">{record.plan}</ClinicalField>
          <ClinicalField label="Lifestyle Advice">{record.lifestyle_advice}</ClinicalField>
          {record.follow_up_date && (
            <ClinicalField label="Follow-up">{formatDate(record.follow_up_date)}</ClinicalField>
          )}
        </ClinicalSection>
      )}
    </div>
  );
}
