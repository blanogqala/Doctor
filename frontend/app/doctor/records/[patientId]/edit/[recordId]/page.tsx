'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { usePracticeAccess } from '@/lib/use-practice-access';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RecordStickyHeader } from '@/components/records/record-sticky-header';
import { RecordSubTabs, RECORD_TAB_TRIGGER_CLASS } from '@/components/records/record-sub-tabs';
import { DoctorsNotesTab } from '@/components/records/doctors-notes-tab';
import { ConsultationEvidence } from '@/components/records/consultation-evidence';
import { CheckupTelemedicinePanel } from '@/components/records/checkup-telemedicine-panel';
import { ConsentModal } from '@/components/records/consent-modal';
import {
  ScribeReviewPanel,
  type ScribeFieldKey,
} from '@/components/records/scribe-review-panel';
import { ClinicalNotesEditor } from '@/components/records/clinical-notes-editor';
import { ReferralLetterComposer } from '@/components/records/referral-letter-composer';
import { ClinicalLetterComposer } from '@/components/records/clinical-letter-composer';
import { useConsultationRecorder } from '@/hooks/useConsultationRecorder';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';
import { medicalRecordsApi } from '@/lib/api/medical-records';
import { aiApi, type ScribeSuggestions, type ScribeConfidenceScores } from '@/lib/api/ai';
import { normalizeDoctorNotes, uid } from '@/lib/doctor-notes';
import {
  clinicalFormFromRecord,
  clinicalFormToApiPayload,
  emptyClinicalForm,
  formatPositiveRosSummary,
  formatVitalsSummary,
  type ClinicalForm,
} from '@/lib/clinical-form';
import {
  mergeAiSuggestions,
  markFieldsAccepted,
  markFieldEdited,
  type AiFieldProvenanceMap,
  type MergeableSuggestions,
} from '@/lib/ai-merge';
import { buildConsultationSavePayload, emptyClinicalLetterSave, parseClinicalLetterSave, type MedicationSaveItem } from '@/lib/clinical/consultation-save-payload';
import {
  autosaveStatusLabel,
  useConsultationAutosave,
} from '@/lib/clinical/use-consultation-autosave';
import {
  hasPendingRecordingWithoutConsent,
  persistConsultationRecording,
  saveConsultationWithRecording,
  type PendingConsultationRecording,
} from '@/lib/clinical/persist-consultation-recording';
import { medicalRecordToFormState } from '@/lib/clinical/consultation-form-state';
import { formatDate } from '@/lib/format';
import { patientDisplayName } from '@/lib/patients/display-name';
import type { Appointment, DoctorPrivateNote, MedicalRecord, ReferralUrgency } from '@/lib/types';
import { AlertTriangle, ArrowRightLeft, CheckCircle, Loader2, Mic, Plus, Square, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const SPECIALTIES = [
  'Cardiology', 'Neurology', 'Orthopedics', 'Dermatology', 'Psychiatry',
  'Gastroenterology', 'Endocrinology', 'Pulmonology', 'Nephrology',
  'Urology', 'Gynecology', 'Ophthalmology', 'ENT', 'Oncology', 'Rheumatology',
];

const URGENCY_OPTIONS: { value: ReferralUrgency; label: string; desc: string }[] = [
  { value: 'ROUTINE', label: 'Routine', desc: '2-4 weeks' },
  { value: 'URGENT', label: 'Urgent', desc: '24-48 hours' },
];

function aiSourcedFromProvenance(map: AiFieldProvenanceMap): Set<string> {
  return new Set(
    Object.entries(map)
      .filter(([, e]) =>
        e.source === 'AI' ||
        e.source === 'AI_ACCEPTED' ||
        e.source === 'AI_ACCEPTED_AND_EDITED'
      )
      .map(([k]) => k)
  );
}

interface MedicationItem {
  id: string;
  drug_name: string;
  generic_name: string;
  brand_name: string;
  strength: string;
  dosage_form: string;
  route: string;
  frequency: string;
  duration: string;
  instructions: string;
  is_prn: boolean;
  quantity: string;
}

export default function EditClinicalRecordPage() {
  const params = useParams<{ patientId: string; recordId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const { canMutate } = usePracticeAccess();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [dirtySeq, setDirtySeq] = useState(0);
  const [activeTab, setActiveTab] = useState('clinical');
  const [isCheckup, setIsCheckup] = useState(false);
  const [isTelemedicineCheckup, setIsTelemedicineCheckup] = useState(false);
  const [linkedAppointment, setLinkedAppointment] = useState<Appointment | null>(null);
  const [parentRecordId, setParentRecordId] = useState<string | null>(null);
  const [patientName, setPatientName] = useState('');
  const [idNumber, setIdNumber] = useState<string | null>(null);
  const [gender, setGender] = useState<string | null>(null);
  const [patientAgeHint, setPatientAgeHint] = useState<string | null>(null);
  const [patientPhone, setPatientPhone] = useState<string | null>(null);
  const [patientEmail, setPatientEmail] = useState<string | null>(null);
  const [patientAddressLine, setPatientAddressLine] = useState<string | null>(null);
  const [patientAllergies, setPatientAllergies] = useState<string | null>(null);
  const [patientMedicalHistory, setPatientMedicalHistory] = useState<string | null>(null);
  const [doctorName, setDoctorName] = useState('Doctor');
  const [doctorPracticeName, setDoctorPracticeName] = useState<string | null>(null);
  const [doctorSpecialization, setDoctorSpecialization] = useState<string | null>(null);
  const [doctorPhone, setDoctorPhone] = useState<string | null>(null);
  const [doctorEmail, setDoctorEmail] = useState<string | null>(null);
  const [doctorHpcsa, setDoctorHpcsa] = useState<string | null>(null);
  const [isDraft, setIsDraft] = useState(false);
  const [loadedRecord, setLoadedRecord] = useState<MedicalRecord | null>(null);
  const [clinical, setClinical] = useState<ClinicalForm>(emptyClinicalForm());
  const [aiSourcedFields, setAiSourcedFields] = useState<Set<string>>(new Set());
  const [aiProvenance, setAiProvenance] = useState<AiFieldProvenanceMap>({});
  const [consentId, setConsentId] = useState<string | null>(null);
  const [scribeProcessingStep, setScribeProcessingStep] = useState<
    'transcribing' | 'drafting'
  >('transcribing');
  const [privateNotes, setPrivateNotes] = useState<DoctorPrivateNote[]>([]);
  const [medications, setMedications] = useState<MedicationItem[]>([]);
  const [referral, setReferral] = useState({
    referred_to: '',
    specialty: '',
    institution: '',
    contact: '',
    reason: '',
    urgency: 'ROUTINE' as ReferralUrgency,
    clinical_summary: '',
    specific_questions: '',
  });
  const [clinicalLetter, setClinicalLetter] = useState(emptyClinicalLetterSave());

  const [consentOpen, setConsentOpen] = useState(false);
  const [scribePhase, setScribePhase] = useState<
    'idle' | 'recording' | 'processing' | 'review'
  >('idle');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [scribeUsed, setScribeUsed] = useState(false);
  const [scribeResolved, setScribeResolved] = useState(true);
  const [aiTranscript, setAiTranscript] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<ScribeSuggestions | null>(null);
  const [aiConfidence, setAiConfidence] = useState<ScribeConfidenceScores>({});
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  const recorder = useConsultationRecorder();

  const viewHref = `/doctor/records/${params.patientId}/view/${params.recordId}`;
  const folderHref = `/doctor/records?patient=${params.patientId}&section=consultations`;
  const canSave = (isCheckup || clinical.chief_complaint.trim().length > 0) && canMutate;
  const scribeBlocksComplete = scribeUsed && !scribeResolved;
  const canComplete =
    canSave &&
    !scribeBlocksComplete &&
    scribePhase !== 'recording' &&
    scribePhase !== 'processing';

  const markChanged = () => {
    setDirtySeq((n) => n + 1);
    setHasChanges(true);
  };

  const buildSavePayload = useCallback(
    (options?: { isDraft?: boolean; autosave?: boolean; lettersOnly?: boolean }) =>
      buildConsultationSavePayload({
        patientId: params.patientId,
        clinical,
        privateNotes,
        medications: medications as MedicationSaveItem[],
        referral,
        clinicalLetter,
        aiProvenance,
        appointmentId: linkedAppointment?.id ?? loadedRecord?.appointment_id ?? null,
        isDraft: options?.isDraft ?? isDraft,
        autosave: options?.autosave,
        lettersOnly: options?.lettersOnly,
      }),
    [
      params.patientId,
      clinical,
      privateNotes,
      medications,
      referral,
      clinicalLetter,
      aiProvenance,
      linkedAppointment?.id,
      loadedRecord?.appointment_id,
      isDraft,
    ]
  );

  const autosave = useConsultationAutosave({
    recordId: params.recordId,
    enabled: !loading && isDraft && Boolean(user?.doctor?.id) && canMutate,
    hasChanges,
    dirtySeq,
    buildPayload: () => buildSavePayload({ autosave: true, isDraft: true }),
    onRecordCreated: () => {},
    onServerRecordLoaded: (record) => {
      const state = medicalRecordToFormState(record);
      setClinical(state.clinical);
      setPrivateNotes(state.privateNotes);
      setMedications(state.medications as MedicationItem[]);
      setReferral(state.referral);
      setClinicalLetter(state.clinicalLetter);
      setAiProvenance(state.aiProvenance);
      setHasChanges(false);
    },
    onSaved: () => setHasChanges(false),
  });

  const updateClinical = (
    patch: Partial<ClinicalForm>,
    options?: { fromAi?: boolean; aiKeys?: string[] }
  ) => {
    setClinical((prev) => ({ ...prev, ...patch }));
    markChanged();
    if (options?.fromAi && options.aiKeys) {
      setAiSourcedFields((prev) => {
        const next = new Set(prev);
        options.aiKeys!.forEach((k) => next.add(k));
        return next;
      });
    } else if (!options?.fromAi) {
      setAiProvenance((prev) => {
        let next = prev;
        for (const k of Object.keys(patch)) {
          next = markFieldEdited(next, k);
        }
        setAiSourcedFields(aiSourcedFromProvenance(next));
        return next;
      });
    }
  };

  const load = useCallback(async () => {
    try {
      const rec = await medicalRecordsApi.getById(params.recordId);
      if (user?.doctor?.id && rec.doctor_id !== user.doctor.id) {
        toast({ title: 'Not authorized', description: 'You can only edit your own records.', variant: 'destructive' });
        router.replace(viewHref);
        return;
      }
      if (rec.is_erroneous) {
        toast({ title: 'Cannot edit', description: 'Erroneous records cannot be edited.', variant: 'destructive' });
        router.replace(viewHref);
        return;
      }

      setPatientName(patientDisplayName(rec.patient));
      setIdNumber(rec.patient?.id_number ?? null);
      setGender(rec.patient?.gender ?? null);
      setPatientAgeHint(
        rec.patient?.date_of_birth
          ? `Date of Birth: ${formatDate(rec.patient.date_of_birth)}`
          : null
      );
      setPatientPhone(rec.patient?.profile?.phone ?? null);
      setPatientEmail(rec.patient?.profile?.email ?? null);
      setPatientAddressLine(
        [rec.patient?.address, rec.patient?.city, rec.patient?.province]
          .filter(Boolean)
          .join(', ') || null
      );
      setPatientAllergies(rec.patient?.allergies ?? null);
      setPatientMedicalHistory(rec.patient?.medical_history ?? null);
      setDoctorName(
        rec.doctor?.profile?.full_name ?? user?.profile?.full_name ?? 'Doctor'
      );
      setDoctorPracticeName(
        rec.doctor?.practice_name ?? user?.doctor?.practice_name ?? null
      );
      setDoctorSpecialization(
        rec.doctor?.specialization ?? user?.doctor?.specialization ?? null
      );
      setDoctorPhone(rec.doctor?.profile?.phone ?? user?.profile?.phone ?? null);
      setDoctorEmail(rec.doctor?.profile?.email ?? user?.profile?.email ?? null);
      setDoctorHpcsa(
        rec.doctor?.hpcsa_registration_number ??
          user?.doctor?.hpcsa_registration_number ??
          null
      );
      setIsDraft(rec.is_draft);
      setLoadedRecord(rec);
      const checkup = Boolean(rec.parent_record_id);
      setIsCheckup(checkup);
      setParentRecordId(rec.parent_record_id ?? null);
      const appt = rec.appointment ?? null;
      setLinkedAppointment(appt);
      const telemedCheckup = checkup && appt?.type === 'TELEMEDICINE';
      setIsTelemedicineCheckup(Boolean(telemedCheckup));
      const tabParam = searchParams.get('tab');
      if (tabParam && ['clinical', 'prescription', 'referral', 'notes'].includes(tabParam)) {
        setActiveTab(tabParam);
      } else if (telemedCheckup) {
        setActiveTab('clinical');
      } else if (checkup) {
        setActiveTab('clinical');
      }
      setClinical(clinicalFormFromRecord(rec));
      const provenance = (rec.ai_field_provenance as AiFieldProvenanceMap | null) ?? {};
      setAiProvenance(provenance);
      setAiSourcedFields(aiSourcedFromProvenance(provenance));
      setPrivateNotes(normalizeDoctorNotes(rec.doctor_notes_private));
      setMedications(
        (rec.prescriptions ?? []).map((p) => ({
          id: p.id,
          drug_name: p.drug_name,
          generic_name: p.generic_name ?? '',
          brand_name: p.brand_name ?? '',
          strength: p.strength ?? p.dosage ?? '',
          dosage_form: p.dosage_form ?? '',
          route: p.route ?? 'Oral',
          frequency: p.frequency,
          duration: p.duration ?? '',
          instructions: p.instructions ?? '',
          is_prn: p.is_prn,
          quantity: p.quantity != null ? String(p.quantity) : '',
        }))
      );
      const ref = rec.referrals?.[0];
      if (ref) {
        setReferral({
          referred_to: ref.referred_to,
          specialty: ref.specialty ?? '',
          institution: ref.referred_to_institution ?? '',
          contact: ref.referred_to_contact ?? '',
          reason: ref.reason,
          urgency: (ref.urgency as ReferralUrgency) || 'ROUTINE',
          clinical_summary: ref.clinical_summary ?? '',
          specific_questions: ref.specific_questions ?? '',
        });
      }
      setClinicalLetter(parseClinicalLetterSave(rec.clinical_letters));
      autosave.setExpectedUpdatedAt(rec.updated_at);
      setHasChanges(false);
    } catch (err) {
      toast({
        title: 'Failed to load record',
        description: err instanceof Error ? err.message : 'Not found',
        variant: 'destructive',
      });
      router.replace(folderHref);
    } finally {
      setLoading(false);
    }
  }, [params.recordId, user, toast, router, viewHref, folderHref, searchParams]);

  useEffect(() => {
    load();
  }, [load]);

  const handleConsentConfirm = async () => {
    setConsentOpen(false);
    try {
      const consent = await aiApi.createRecordingConsent({
        patient_id: params.patientId,
        medical_record_id: params.recordId,
        appointment_id: linkedAppointment?.id ?? loadedRecord?.appointment_id ?? null,
        consent_mode: 'DICTATION',
      });
      setConsentId(consent.id);
      await logAudit({
        action: 'AI_SCRIBE_CONSENT',
        resource: 'ai_scribe',
        patient_id: params.patientId,
        resource_id: params.recordId,
        new_value: { consent: true, consentId: consent.id, context: 'edit_dictation' },
      });
      await logAudit({
        action: 'AI_SCRIBE_STARTED',
        resource: 'ai_scribe',
        patient_id: params.patientId,
        resource_id: params.recordId,
      });
      await recorder.startRecording();
      setScribePhase('recording');
    } catch (err) {
      setScribePhase('idle');
      setConsentId(null);
      toast({
        title: 'Could not start recording',
        description: err instanceof Error ? err.message : 'Microphone unavailable',
        variant: 'destructive',
      });
    }
  };

  const handleCancelRecording = () => {
    recorder.cancelRecording();
    setScribePhase('idle');
    setConsentId(null);
  };

  const handleStopRecording = async () => {
    if (!consentId) {
      toast({
        title: 'Consent required',
        description: 'Recording consent is missing. Please start again.',
        variant: 'destructive',
      });
      setScribePhase('idle');
      return;
    }
    setScribePhase('processing');
    setScribeProcessingStep('transcribing');
    try {
      const blob = await recorder.stopRecording();
      setAudioBlob(blob);
      setScribeProcessingStep('drafting');
      const result = await aiApi.consultationScribe({
        audio: blob,
        patientId: params.patientId,
        consentId,
        medicalRecordId: params.recordId,
        consentMode: 'DICTATION',
        languageHint: 'auto',
        filename: `consultation-edit-${Date.now()}.webm`,
      });
      setAiTranscript(result.transcript);
      setAiSuggestions(result.suggestions);
      setAiConfidence(result.confidenceScores || {});
      setAiWarnings(result.warnings || []);
      setDetectedLanguage(result.detectedLanguage);
      setScribeUsed(true);
      setScribeResolved(false);
      setScribePhase('review');
      setReviewOpen(true);

      const pending: PendingConsultationRecording = {
        audioBlob: blob,
        aiTranscript: result.transcript,
        consentId,
        detectedLanguage: result.detectedLanguage,
        aiWarnings: result.warnings || [],
        aiConfidence: result.confidenceScores || {},
      };
      autosave.setPaused(true);
      await autosave.waitUntilIdle();
      try {
        const updated = await persistConsultationRecording(params.recordId, pending);
        autosave.setExpectedUpdatedAt(updated.updated_at);
        setLoadedRecord(updated);
        toast({
          title: 'Recording saved',
          description: 'Consultation audio and transcript stored with this draft.',
        });
      } catch (uploadErr) {
        toast({
          title: 'Recording not saved yet',
          description:
            uploadErr instanceof Error
              ? `${uploadErr.message} It will retry when you save.`
              : 'Upload failed. It will retry when you save.',
          variant: 'destructive',
        });
      } finally {
        autosave.setPaused(false);
      }
    } catch (err) {
      setScribePhase('idle');
      toast({
        title: 'AI Clinical Assistant failed',
        description:
          err instanceof Error
            ? err.message
            : 'Processing failed. You can edit notes manually.',
        variant: 'destructive',
      });
    }
  };

  const handleApplyAccepted = (
    accepted: Partial<ScribeSuggestions>,
    acceptedKeys: ScribeFieldKey[]
  ) => {
    const { patch, appliedKeys, skippedKeys } = mergeAiSuggestions({
      existing: clinical as MergeableSuggestions,
      accepted: accepted as Partial<MergeableSuggestions>,
      provenance: aiProvenance,
    });

    const doctorId = user?.doctor?.id ?? '';
    const nextProvenance = markFieldsAccepted(aiProvenance, appliedKeys, doctorId);
    setAiProvenance(nextProvenance);
    setAiSourcedFields(aiSourcedFromProvenance(nextProvenance));

    if (Object.keys(patch).length > 0) {
      updateClinical(patch as Partial<ClinicalForm>, { fromAi: true, aiKeys: appliedKeys });
    }

    setScribeResolved(true);
    setReviewOpen(false);

    if (appliedKeys.length > 0) {
      void aiApi.suggestionDecision({
        patient_id: params.patientId,
        medical_record_id: params.recordId,
        decision: 'ACCEPTED',
        fields: appliedKeys,
      });
    }

    void logAudit({
      action: 'AI_SCRIBE_APPLIED',
      resource: 'ai_scribe',
      patient_id: params.patientId,
      resource_id: params.recordId,
      new_value: { acceptedFields: acceptedKeys, appliedKeys, skippedKeys, context: 'edit' },
    });

    const descParts: string[] = [];
    if (appliedKeys.length) descParts.push(`${appliedKeys.length} field(s) updated`);
    if (skippedKeys.length) {
      descParts.push(`${skippedKeys.length} doctor-authored field(s) preserved`);
    }
    toast({
      title: 'AI suggestions applied',
      description: descParts.length
        ? `${descParts.join('. ')}. Review before saving.`
        : 'No fields were accepted.',
    });
  };

  const handleDiscardAll = () => {
    setScribeResolved(true);
    setReviewOpen(false);
    const rejectedFields = aiSuggestions
      ? Object.keys(aiSuggestions).filter((k) => {
          const v = aiSuggestions[k as keyof ScribeSuggestions];
          return v !== undefined && v !== null && v !== '';
        })
      : [];
    if (rejectedFields.length > 0) {
      void aiApi.suggestionDecision({
        patient_id: params.patientId,
        medical_record_id: params.recordId,
        decision: 'REJECTED',
        fields: rejectedFields,
      });
    }
    setAiSuggestions(null);
    setScribePhase('idle');
    void logAudit({
      action: 'AI_SCRIBE_REJECTED',
      resource: 'ai_scribe',
      patient_id: params.patientId,
      resource_id: params.recordId,
      new_value: { discarded: true, context: 'edit' },
    });
    toast({
      title: 'AI notes discarded',
      description: 'Continue editing manually. New recording is kept for evidence when you save.',
    });
  };

  const handleReRecord = () => {
    toast({
      title: 'Re-record',
      description:
        'Doctor-authored fields will be preserved when you apply a new AI-assisted draft.',
    });
    setReviewOpen(false);
    setAiSuggestions(null);
    setAiTranscript(null);
    setAudioBlob(null);
    setAiWarnings([]);
    setAiConfidence({});
    setDetectedLanguage(null);
    setConsentId(null);
    setScribePhase('idle');
    setScribeResolved(false);
    setConsentOpen(true);
  };

  const handleSave = async () => {
    if (!canComplete) return;
    setSaving(true);

    const pending: PendingConsultationRecording = {
      audioBlob,
      aiTranscript,
      consentId,
      detectedLanguage,
      aiWarnings,
      aiConfidence,
    };

    try {
      if (!isDraft) {
        const data = await medicalRecordsApi.update(
          params.recordId,
          buildSavePayload({ lettersOnly: true })
        );
        setLoadedRecord(data);
        await logAudit({
          action: 'UPDATE',
          resource: 'medical_records',
          resource_id: params.recordId,
          patient_id: params.patientId,
          new_value: { referrals: true },
        });
        toast({
          title: 'Record saved',
          description: 'Referral and clinical letters have been saved.',
        });
        router.push(`${viewHref}?tab=referral`);
        return;
      }

      const { record: data, recordingSaved, uploadFailed } = await saveConsultationWithRecording({
        finalize: true,
        pending,
        saveRecord: async (draft) =>
          medicalRecordsApi.update(params.recordId, buildSavePayload({ isDraft: draft })),
      });

      if (uploadFailed) {
        toast({
          title: 'Could not save recording',
          description: 'The record remains a draft. Fix the issue and try completing again.',
          variant: 'destructive',
        });
        setSaving(false);
        return;
      }

      if (hasPendingRecordingWithoutConsent(pending)) {
        toast({
          title: 'Record saved without recording',
          description: 'Consent id missing; consultation audio was not uploaded.',
          variant: 'destructive',
        });
      }

      setLoadedRecord(data);

      await logAudit({
        action: 'UPDATE',
        resource: 'medical_records',
        resource_id: params.recordId,
        patient_id: params.patientId,
        new_value: {
          is_draft: false,
          has_scribe_recording: recordingSaved || !!data.has_scribe_recording,
        },
      });

      toast({
        title: isDraft ? 'Record completed' : 'Record saved',
        description:
          recordingSaved || data.has_scribe_recording
            ? 'Changes and consultation recording saved.'
            : 'Changes have been saved.',
      });
      router.push(`${viewHref}?tab=referral`);
    } catch (err) {
      toast({
        title: 'Failed to save',
        description: err instanceof Error ? err.message : 'Save failed',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const renderRecordAction = () => {
    if (scribePhase === 'recording') {
      return (
        <div className="flex flex-1 flex-wrap items-center gap-2 sm:flex-none">
          <Button
            variant="destructive"
            onClick={() => void handleStopRecording()}
            className="flex-1 sm:flex-none"
          >
            <span className="mr-2 inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-white" />
            Recording consultation {recorder.formattedDuration}
            <Square className="ml-2 h-3.5 w-3.5 fill-current" />
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleCancelRecording}
            className="flex-1 sm:flex-none"
          >
            Cancel
          </Button>
        </div>
      );
    }
    if (scribePhase === 'processing') {
      return (
        <Button variant="outline" disabled className="flex-1 sm:flex-none">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {scribeProcessingStep === 'transcribing'
            ? 'Transcribing…'
            : 'Preparing clinical draft…'}
        </Button>
      );
    }
    if ((scribePhase === 'review' || aiTranscript) && (aiSuggestions || aiTranscript)) {
      return (
        <Button
          variant="outline"
          onClick={() => setReviewOpen(true)}
          className="flex-1 sm:flex-none"
        >
          <CheckCircle className="mr-2 h-4 w-4 text-emerald-600" />
          {aiSuggestions ? 'Review AI-assisted draft' : 'View Transcript'}
        </Button>
      );
    }
    return (
      <Button
        variant="outline"
        onClick={() => setConsentOpen(true)}
        disabled={saving || !canMutate}
        className="flex-1 sm:flex-none"
      >
        <Mic className="mr-2 h-4 w-4" />
        <span className="hidden sm:inline">AI Clinical Assistant</span>
        <span className="sm:hidden">AI Assist</span>
      </Button>
    );
  };

  if (loading) {
    return (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );
  }

  return (
      <div>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <RecordStickyHeader
            onBack={() => router.push(viewHref)}
            backLabel="Back to Record"
            patientName={patientName}
            idNumber={idNumber}
            gender={gender}
            actions={
              <>
                {isDraft &&
                  (() => {
                    const saveLabel = autosaveStatusLabel(autosave.status);
                    if (saveLabel === 'Save failed') {
                      return (
                        <button
                          type="button"
                          onClick={() => autosave.retry()}
                          className="mr-1 hidden text-xs text-destructive underline sm:inline"
                        >
                          Save failed — retry
                        </button>
                      );
                    }
                    if (saveLabel) {
                      return (
                        <span className="mr-1 hidden text-xs text-muted-foreground sm:inline">
                          {saveLabel}
                        </span>
                      );
                    }
                    return null;
                  })()}
                {scribeBlocksComplete && (
                  <span className="mr-1 hidden text-xs text-amber-600 sm:inline">
                    Review AI notes first
                  </span>
                )}
                {renderRecordAction()}
                <Button
                  onClick={() => void handleSave()}
                  disabled={saving || !canComplete}
                  title={
                    scribeBlocksComplete
                      ? 'Apply or discard AI suggestions before saving'
                      : undefined
                  }
                >
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="mr-2 h-4 w-4" />
                  )}
                  {isDraft ? 'Complete & Save' : 'Save Changes'}
                </Button>
              </>
            }
            tabs={
              <RecordSubTabs
                sticky={false}
                variant={isCheckup ? 'checkup' : 'doctor'}
                clinicalLabel={isTelemedicineCheckup ? 'Telemedicine' : 'Clinical Notes'}
              />
            }
          />

          {isCheckup && (
            <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground">
              Check-up visit
              {parentRecordId ? (
                <>
                  {' '}
                  — linked to{' '}
                  <button
                    type="button"
                    className="font-medium text-primary underline-offset-2 hover:underline"
                    onClick={() =>
                      router.push(
                        `/doctor/records/${params.patientId}/view/${parentRecordId}`
                      )
                    }
                  >
                    parent consultation
                  </button>
                </>
              ) : null}
              {isTelemedicineCheckup
                ? '. Use the Telemedicine tab for video, and Record Consultation for AI SOAP notes.'
                : '. Use Clinical Notes and Record Consultation for AI summary notes.'}
            </div>
          )}

          <ConsentModal
            open={consentOpen}
            onOpenChange={setConsentOpen}
            onConfirm={() => void handleConsentConfirm()}
            mode="dictation"
          />

          {aiTranscript && (
            <ScribeReviewPanel
              open={reviewOpen}
              onOpenChange={setReviewOpen}
              transcript={aiTranscript}
              detectedLanguage={detectedLanguage}
              suggestions={aiSuggestions ?? {}}
              confidenceScores={aiConfidence}
              warnings={aiWarnings}
              onApplyAccepted={handleApplyAccepted}
              onDiscardAll={handleDiscardAll}
              onReRecord={handleReRecord}
            />
          )}

          <TabsContent value="clinical" className="mt-4 space-y-4">
            {isTelemedicineCheckup && linkedAppointment && (
              <CheckupTelemedicinePanel
                appointment={linkedAppointment}
                recordId={params.recordId}
                onAppointmentChange={(appt) => {
                  setLinkedAppointment(appt);
                  setLoadedRecord((prev) => (prev ? { ...prev, appointment: appt } : prev));
                }}
              />
            )}
            <ConsultationEvidence
              record={loadedRecord}
              localAudio={audioBlob}
              localTranscript={aiTranscript}
            />
            <ClinicalNotesEditor
              value={clinical}
              onChange={(patch) => updateClinical(patch)}
              aiSourcedFields={aiSourcedFields}
              idPrefix="edit"
            />
          </TabsContent>

          <TabsContent value="prescription" className="mt-4 space-y-3">
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() =>
                  setMedications([
                    ...medications,
                    {
                      id: uid(),
                      drug_name: '',
                      generic_name: '',
                      brand_name: '',
                      strength: '',
                      dosage_form: '',
                      route: 'Oral',
                      frequency: '',
                      duration: '',
                      instructions: '',
                      is_prn: false,
                      quantity: '',
                    },
                  ])
                }
              >
                <Plus className="mr-2 h-4 w-4" /> Add Medication
              </Button>
            </div>
            {medications.length === 0 ? (
              <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
                No medications.
              </div>
            ) : (
              medications.map((med) => (
                <Card key={med.id}>
                  <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
                    <div className="space-y-1 sm:col-span-2">
                      <div className="flex items-center justify-between">
                        <Label>Drug Name</Label>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => setMedications(medications.filter((m) => m.id !== med.id))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <Input
                        value={med.drug_name}
                        onChange={(e) =>
                          setMedications(
                            medications.map((m) =>
                              m.id === med.id ? { ...m, drug_name: e.target.value } : m
                            )
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Strength</Label>
                      <Input
                        value={med.strength}
                        onChange={(e) =>
                          setMedications(
                            medications.map((m) =>
                              m.id === med.id ? { ...m, strength: e.target.value } : m
                            )
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Frequency</Label>
                      <Input
                        value={med.frequency}
                        onChange={(e) =>
                          setMedications(
                            medications.map((m) =>
                              m.id === med.id ? { ...m, frequency: e.target.value } : m
                            )
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Duration</Label>
                      <Input
                        value={med.duration}
                        onChange={(e) =>
                          setMedications(
                            medications.map((m) =>
                              m.id === med.id ? { ...m, duration: e.target.value } : m
                            )
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Instructions</Label>
                      <Input
                        value={med.instructions}
                        onChange={(e) =>
                          setMedications(
                            medications.map((m) =>
                              m.id === med.id ? { ...m, instructions: e.target.value } : m
                            )
                          )
                        }
                      />
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="referral" className="mt-4">
            <Tabs defaultValue="referral" className="space-y-4">
              <TabsList className="grid h-auto w-full max-w-md grid-cols-2 gap-1 bg-primary-soft border-2 border-primary">
                <TabsTrigger value="referral" className={RECORD_TAB_TRIGGER_CLASS}>
                  Referral
                </TabsTrigger>
                <TabsTrigger value="other-letters" className={RECORD_TAB_TRIGGER_CLASS}>
                  Others Letter
                </TabsTrigger>
              </TabsList>

              <TabsContent value="referral" className="mt-0 space-y-4">
            <Card>
              <CardContent className="space-y-4 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <ArrowRightLeft className="h-4 w-4" />
                  A. Referral Details
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Referred To (Doctor Name)</Label>
                    <Input
                      value={referral.referred_to}
                      onChange={(e) => setReferral({ ...referral, referred_to: e.target.value })}
                      placeholder="e.g., Dr. Jane Smith"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Specialty</Label>
                    {referral.specialty && !SPECIALTIES.includes(referral.specialty) ? (
                      <Input
                        value={referral.specialty}
                        onChange={(e) => setReferral({ ...referral, specialty: e.target.value })}
                      />
                    ) : (
                      <Select
                        value={referral.specialty || undefined}
                        onValueChange={(v) => setReferral({ ...referral, specialty: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select specialty..." />
                        </SelectTrigger>
                        <SelectContent>
                          {SPECIALTIES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label>Institution</Label>
                    <Input
                      value={referral.institution}
                      onChange={(e) => setReferral({ ...referral, institution: e.target.value })}
                      placeholder="e.g., Life Healthcare, Netcare"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Contact (Phone/Fax/Email)</Label>
                    <Input
                      value={referral.contact}
                      onChange={(e) => setReferral({ ...referral, contact: e.target.value })}
                      placeholder="e.g., specialist@clinic.co.za"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <AlertTriangle className="h-4 w-4" />
                  B. Urgency Level
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {URGENCY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setReferral({ ...referral, urgency: opt.value })}
                      className={cn(
                        'rounded-lg border p-3 text-center transition-all',
                        referral.urgency === opt.value
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                          : 'hover:border-primary/40'
                      )}
                    >
                      <p className="text-sm font-semibold text-foreground">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="text-sm font-semibold">C. Referral Letter</div>
                <ReferralLetterComposer
                  reason={referral.reason}
                  letter={referral.clinical_summary}
                  onReasonChange={(value) => setReferral({ ...referral, reason: value })}
                  onLetterChange={(value) =>
                    setReferral({ ...referral, clinical_summary: value, specific_questions: '' })
                  }
                  patientId={params.patientId}
                  patientDisplayName={patientName}
                  ageOrDobHint={patientAgeHint}
                  gender={gender}
                  referringDoctor={{
                    fullName: doctorName,
                    practiceName: doctorPracticeName || undefined,
                    specialization: doctorSpecialization || undefined,
                    phone: doctorPhone || undefined,
                    email: doctorEmail || undefined,
                    hpcsa: doctorHpcsa || undefined,
                  }}
                  patientContext={{
                    displayName: patientName,
                    dateOfBirthOrAge: patientAgeHint,
                    gender,
                    phone: patientPhone,
                    email: patientEmail,
                    addressLine: patientAddressLine,
                    allergies: patientAllergies,
                    medicalHistory: patientMedicalHistory,
                  }}
                  clinical={{
                    chief_complaint: clinical.chief_complaint,
                    history_present_illness: clinical.history_present_illness,
                    assessment: clinical.assessment,
                    plan: clinical.plan,
                    primary_diagnosis: clinical.primary_diagnosis,
                    physical_exam_notes: clinical.physical_exam_notes,
                    severity: clinical.severity,
                    general_appearance: clinical.general_appearance,
                    differential_diagnoses: clinical.differential_diagnoses,
                    vitals_summary: formatVitalsSummary(clinical.vitals),
                    positive_ros_summary: formatPositiveRosSummary(clinical.review_of_systems),
                    medications_summary: medications
                      .filter((m) => m.drug_name.trim())
                      .map((m) => `${m.drug_name} ${m.strength} ${m.frequency}`.trim())
                      .join('\n'),
                  }}
                  referralMeta={{
                    referred_to: referral.referred_to,
                    specialty: referral.specialty,
                    institution: referral.institution,
                    contact: referral.contact,
                    reason: referral.reason,
                    urgency: referral.urgency,
                    specific_questions: referral.specific_questions,
                  }}
                  disabled={!canMutate}
                />
              </CardContent>
            </Card>
              </TabsContent>

              <TabsContent value="other-letters" className="mt-0">
                <Card>
                  <CardContent className="space-y-3 p-4">
                    <div className="text-sm font-semibold">D. Clinical letters</div>
                    <ClinicalLetterComposer
                      patientId={params.patientId}
                      patientDisplayName={patientName}
                      doctorDisplayName={doctorName}
                      practiceName={doctorPracticeName || null}
                      consultationDate={new Date().toISOString().slice(0, 10)}
                      diagnosisText={clinical.primary_diagnosis || null}
                      value={clinicalLetter}
                      onChange={(next) => {
                        setClinicalLetter(next);
                        markChanged();
                      }}
                      disabled={!canMutate}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="notes" className="mt-4">
            <DoctorsNotesTab
              notes={privateNotes}
              doctorName={doctorName}
              onChange={setPrivateNotes}
            />
          </TabsContent>
        </Tabs>
      </div>
  );
}
