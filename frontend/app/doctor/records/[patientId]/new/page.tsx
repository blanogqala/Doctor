'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { usePracticeAccess } from '@/lib/use-practice-access';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';
import { medicalRecordsApi } from '@/lib/api/medical-records';
import { patientsApi } from '@/lib/api/patients';
import { formatDate } from '@/lib/format';
import { maskIdNumber } from '@/lib/format';
import { patientDisplayName } from '@/lib/patients/display-name';
import type { Patient, Doctor, ReferralUrgency } from '@/lib/types';
import {
  ArrowLeft, Pill, ArrowRightLeft, CheckCircle, Mic, Square,
  Loader2, Plus, Trash2, Copy, ChevronUp,
  ChevronDown, Printer, AlertTriangle, FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { RecordStickyHeader } from '@/components/records/record-sticky-header';
import { RecordSubTabs, RECORD_TAB_TRIGGER_CLASS } from '@/components/records/record-sub-tabs';
import { DoctorsNotesTab } from '@/components/records/doctors-notes-tab';
import { ConsentModal } from '@/components/records/consent-modal';
import {
  ScribeReviewPanel,
  type ScribeFieldKey,
} from '@/components/records/scribe-review-panel';
import { ClinicalNotesEditor } from '@/components/records/clinical-notes-editor';
import { ConsultationEvidence } from '@/components/records/consultation-evidence';
import { ReferralLetterComposer } from '@/components/records/referral-letter-composer';
import { ClinicalLetterComposer } from '@/components/records/clinical-letter-composer';
import { useConsultationRecorder } from '@/hooks/useConsultationRecorder';
import { aiApi, type ScribeSuggestions, type ScribeConfidenceScores } from '@/lib/api/ai';
import type { DoctorPrivateNote } from '@/lib/types';
import { normalizeDoctorNotes } from '@/lib/doctor-notes';
import {
  emptyClinicalForm,
  clinicalFormToApiPayload,
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
import { buildConsultationSavePayload, emptyClinicalLetterSave, type MedicationSaveItem } from '@/lib/clinical/consultation-save-payload';
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
import {
  clearLegacyClinicalDraft,
  legacyClinicalDraftKey,
  medicalRecordToFormState,
} from '@/lib/clinical/consultation-form-state';
import type { MedicalRecord } from '@/lib/types';

// ─── Constants ───
const ROUTES = ['Oral', 'IV', 'IM', 'SC', 'Topical', 'Inhalation', 'Sublingual', 'Rectal', 'Ophthalmic', 'Otic'];
const DOSAGE_FORMS = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Cream', 'Ointment', 'Drops', 'Inhaler', 'Suppository'];

const FREQUENCIES = [
  { value: 'OD', label: 'OD — Once daily' },
  { value: 'BD', label: 'BD — Twice daily' },
  { value: 'TDS', label: 'TDS — Three times daily' },
  { value: 'QID', label: 'QID — Four times daily' },
  { value: 'Q4H', label: 'Q4H — Every 4 hours' },
  { value: 'Q6H', label: 'Q6H — Every 6 hours' },
  { value: 'Q8H', label: 'Q8H — Every 8 hours' },
  { value: 'PRN', label: 'PRN — As needed' },
  { value: 'STAT', label: 'STAT — Immediately' },
  { value: 'HS', label: 'HS — At bedtime' },
];

const DURATION_UNITS = ['Days', 'Weeks', 'Months', 'Ongoing'];

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

// ─── Types ───
interface MedicationItem {
  id: string;
  drug_name: string;
  generic_name: string;
  brand_name: string;
  strength: string;
  dosage_form: string;
  route: string;
  frequency: string;
  duration_value: string;
  duration_unit: string;
  quantity: string;
  instructions: string;
  is_prn: boolean;
}

// ─── Helper ───
function uid() { return Math.random().toString(36).slice(2, 11); }

function calcQuantity(durationValue: string, durationUnit: string, frequency: string): string {
  const dv = parseInt(durationValue, 10);
  if (!dv || !frequency) return '';
  let perDay = 1;
  if (frequency === 'BD') perDay = 2;
  else if (frequency === 'TDS') perDay = 3;
  else if (frequency === 'QID') perDay = 4;
  else if (frequency === 'Q4H') perDay = 6;
  else if (frequency === 'Q6H') perDay = 4;
  else if (frequency === 'Q8H') perDay = 3;
  else if (frequency === 'OD' || frequency === 'HS') perDay = 1;

  let days = dv;
  if (durationUnit === 'Weeks') days = dv * 7;
  else if (durationUnit === 'Months') days = dv * 30;
  else if (durationUnit === 'Ongoing') return '30';

  return String(Math.ceil(days * perDay));
}

// ─── Main Component ───
export default function NewClinicalNotePage() {
  const params = useParams<{ patientId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const { canMutate, mutationHint } = usePracticeAccess();
  const { toast } = useToast();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('clinical');
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [dirtySeq, setDirtySeq] = useState(0);
  const [draftRecordId, setDraftRecordId] = useState<string | null>(null);
  const [draftInitialized, setDraftInitialized] = useState(false);
  const [loadedRecord, setLoadedRecord] = useState<MedicalRecord | null>(null);
  const appointmentId = searchParams.get('appointment') ?? searchParams.get('appointment_id');

  // AI Scribe state
  const [consentOpen, setConsentOpen] = useState(false);
  const [scribePhase, setScribePhase] = useState<
    'idle' | 'recording' | 'processing' | 'review'
  >('idle');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [scribeUsed, setScribeUsed] = useState(false);
  const [scribeResolved, setScribeResolved] = useState(false);
  const [aiTranscript, setAiTranscript] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<ScribeSuggestions | null>(null);
  const [aiConfidence, setAiConfidence] = useState<ScribeConfidenceScores>({});
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [aiSourcedFields, setAiSourcedFields] = useState<Set<string>>(new Set());
  const [aiProvenance, setAiProvenance] = useState<AiFieldProvenanceMap>({});
  const [consentId, setConsentId] = useState<string | null>(null);
  const [scribeProcessingStep, setScribeProcessingStep] = useState<
    'transcribing' | 'drafting'
  >('transcribing');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  const recorder = useConsultationRecorder();

  const [clinical, setClinical] = useState<ClinicalForm>(emptyClinicalForm);

  const [privateNotes, setPrivateNotes] = useState<DoctorPrivateNote[]>([]);
  const [medications, setMedications] = useState<MedicationItem[]>([]);

  const [referral, setReferral] = useState({
    referred_to: '', specialty: '', institution: '', contact: '',
    reason: '', urgency: 'ROUTINE' as ReferralUrgency,
    clinical_summary: '', specific_questions: '',
  });
  const [clinicalLetter, setClinicalLetter] = useState(emptyClinicalLetterSave());

  const buildSavePayload = useCallback(
    (options?: { isDraft?: boolean; autosave?: boolean; expectedUpdatedAt?: string | null }) => {
      if (!patient) return {};
      return buildConsultationSavePayload({
        patientId: patient.id,
        clinical,
        privateNotes,
        medications: medications as MedicationSaveItem[],
        referral,
        clinicalLetter,
        aiProvenance,
        appointmentId,
        isDraft: options?.isDraft,
        autosave: options?.autosave,
        expectedUpdatedAt: options?.expectedUpdatedAt,
      });
    },
    [patient, clinical, privateNotes, medications, referral, clinicalLetter, aiProvenance, appointmentId]
  );

  const applyFormState = useCallback((state: ReturnType<typeof medicalRecordToFormState>) => {
    setClinical(state.clinical);
    setPrivateNotes(state.privateNotes);
    setMedications(state.medications as MedicationItem[]);
    setReferral(state.referral);
    setClinicalLetter(state.clinicalLetter);
    setAiProvenance(state.aiProvenance);
    setAiSourcedFields(
      new Set(
        Object.entries(state.aiProvenance)
          .filter(([, e]) =>
            e.source === 'AI' ||
            e.source === 'AI_ACCEPTED' ||
            e.source === 'AI_ACCEPTED_AND_EDITED'
          )
          .map(([k]) => k)
      )
    );
  }, []);

  const expectedUpdatedAtSetterRef = useRef<(value: string | null) => void>(() => {});

  const initializeDraft = useCallback(
    async (pat: Patient) => {
      if (!user?.doctor?.id || draftInitialized) return;
      try {
        const drafts = await medicalRecordsApi.list({
          patient_id: pat.id,
          doctor_id: user.doctor.id,
          is_draft: 'true',
        });

        if (drafts.length > 0) {
          const rec = drafts[0];
          applyFormState(medicalRecordToFormState(rec));
          setDraftRecordId(rec.id);
          setLoadedRecord(rec);
          expectedUpdatedAtSetterRef.current(rec.updated_at);
          setDraftInitialized(true);
          return;
        }

        const legacyKey = legacyClinicalDraftKey(String(params.patientId));
        const saved =
          typeof window !== 'undefined' ? localStorage.getItem(legacyKey) : null;
        if (saved) {
          try {
            const data = JSON.parse(saved) as {
              clinical?: ClinicalForm & { doctor_notes_private?: unknown };
              privateNotes?: DoctorPrivateNote[];
              medications?: MedicationItem[];
              referral?: typeof referral;
            };
            if (data.clinical) {
              const { doctor_notes_private, ...rest } = data.clinical;
              setClinical(rest);
              if (doctor_notes_private) {
                setPrivateNotes(normalizeDoctorNotes(doctor_notes_private as DoctorPrivateNote[] | string));
              } else if (data.privateNotes) {
                setPrivateNotes(normalizeDoctorNotes(data.privateNotes));
              }
            }
            if (data.medications) setMedications(data.medications);
            if (data.referral) setReferral(data.referral);
            setHasChanges(true);
            toast({
              title: 'Draft restored',
              description: 'Previous work will be saved securely to the server.',
            });
          } catch {
            // ignore corrupt legacy draft
          }
        }

        setDraftInitialized(true);
      } catch {
        setDraftInitialized(true);
      }
    },
    [user?.doctor?.id, draftInitialized, params.patientId, applyFormState, toast]
  );

  const autosave = useConsultationAutosave({
    recordId: draftRecordId,
    enabled: draftInitialized && Boolean(patient) && Boolean(user?.doctor?.id) && canMutate,
    hasChanges,
    dirtySeq,
    buildPayload: () => buildSavePayload({ autosave: true }),
    onRecordCreated: (record: MedicalRecord) => {
      setDraftRecordId(record.id);
      setLoadedRecord(record);
      clearLegacyClinicalDraft(String(params.patientId));
    },
    onServerRecordLoaded: (record) => {
      applyFormState(medicalRecordToFormState(record));
      setHasChanges(false);
    },
    onSaved: () => setHasChanges(false),
  });

  expectedUpdatedAtSetterRef.current = autosave.setExpectedUpdatedAt;

  const loadPatient = useCallback(async () => {
    if (!user?.doctor?.id) return;
    const pat = await patientsApi.getById(String(params.patientId));
    setPatient(pat);
    setDoctor(
      user.doctor
        ? ({ ...user.doctor, profile: user.profile } as Doctor)
        : null
    );
    await initializeDraft(pat);
    setLoading(false);
  }, [user, params.patientId, initializeDraft]);

  useEffect(() => {
    loadPatient();
  }, [loadPatient]);

  // Unsaved changes warning
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasChanges) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasChanges]);

  const markChanged = () => {
    setDirtySeq((n) => n + 1);
    setHasChanges(true);
  };

  const updateClinical = (patch: Partial<ClinicalForm>, options?: { fromAi?: boolean; aiKeys?: string[] }) => {
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

  const handleConsentConfirm = async () => {
    setConsentOpen(false);
    try {
      const patientId = patient?.id ?? String(params.patientId);
      const consent = await aiApi.createRecordingConsent({
        patient_id: patientId,
        medical_record_id: draftRecordId,
        appointment_id: appointmentId,
        consent_mode: 'CONSULTATION',
      });
      setConsentId(consent.id);
      await logAudit({
        action: 'AI_SCRIBE_CONSENT',
        resource: 'ai_scribe',
        patient_id: patientId,
        new_value: { consent: true, consentId: consent.id, international_processing_disclosed: true },
      });
      await logAudit({
        action: 'AI_SCRIBE_STARTED',
        resource: 'ai_scribe',
        patient_id: patientId,
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
    if (!patient) return;
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
        patientId: patient.id,
        consentId,
        medicalRecordId: draftRecordId,
        consentMode: 'CONSULTATION',
        languageHint: 'auto',
        filename: `consultation-${Date.now()}.webm`,
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

      if (draftRecordId) {
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
          const updated = await persistConsultationRecording(draftRecordId, pending);
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
      }
    } catch (err) {
      setScribePhase('idle');
      toast({
        title: 'AI Clinical Assistant failed',
        description:
          err instanceof Error
            ? err.message
            : 'Processing failed. You can enter notes manually.',
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
        patient_id: patient?.id ?? String(params.patientId),
        decision: 'ACCEPTED',
        fields: appliedKeys,
      });
    }

    void logAudit({
      action: 'AI_SCRIBE_APPLIED',
      resource: 'ai_scribe',
      patient_id: patient?.id ?? params.patientId,
      new_value: { acceptedFields: acceptedKeys, appliedKeys, skippedKeys },
    });

    const descParts: string[] = [];
    if (appliedKeys.length) descParts.push(`${appliedKeys.length} field(s) updated`);
    if (skippedKeys.length) {
      descParts.push(`${skippedKeys.length} doctor-authored field(s) preserved`);
    }
    toast({
      title: 'AI suggestions applied',
      description: descParts.length
        ? `${descParts.join('. ')}. Review before completing.`
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
        patient_id: patient?.id ?? String(params.patientId),
        decision: 'REJECTED',
        fields: rejectedFields,
      });
    }
    setAiSuggestions(null);
    setScribePhase('idle');
    // Keep audioBlob + aiTranscript so Complete & Save can still store evidence
    void logAudit({
      action: 'AI_SCRIBE_REJECTED',
      resource: 'ai_scribe',
      patient_id: patient?.id ?? params.patientId,
      new_value: { discarded: true },
    });
    toast({ title: 'AI notes discarded', description: 'Continue with manual entry. Recording is kept for evidence when you save.' });
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

  const addMedication = () => {
    setMedications([...medications, {
      id: uid(), drug_name: '', generic_name: '', brand_name: '', strength: '',
      dosage_form: '', route: 'Oral', frequency: '', duration_value: '', duration_unit: 'Days',
      quantity: '', instructions: '', is_prn: false,
    }]);
    markChanged();
  };

  const updateMedication = (id: string, field: keyof MedicationItem, value: string | boolean) => {
    setMedications(medications.map(m => m.id === id ? { ...m, [field]: value } : m));
    markChanged();
  };

  const duplicateMedication = (id: string) => {
    const med = medications.find(m => m.id === id);
    if (!med) return;
    setMedications([...medications, { ...med, id: uid() }]);
    markChanged();
  };

  const removeMedication = (id: string) => {
    setMedications(medications.filter(m => m.id !== id));
    markChanged();
  };

  const moveMedication = (id: string, dir: 'up' | 'down') => {
    const idx = medications.findIndex(m => m.id === id);
    if (idx < 0) return;
    const newIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= medications.length) return;
    const copy = [...medications];
    [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
    setMedications(copy);
    markChanged();
  };

  // ─── Save ───
  const handleSave = async (isDraft: boolean) => {
    if (!user?.doctor?.id || !patient) return;
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
      const { record: data, recordingSaved, uploadFailed } = await saveConsultationWithRecording({
        finalize: !isDraft,
        pending,
        saveRecord: async (draft) => {
          const payload = buildSavePayload({ isDraft: draft });
          if (draftRecordId) {
            return medicalRecordsApi.update(draftRecordId, payload);
          }
          const created = await medicalRecordsApi.create(payload);
          setDraftRecordId(created.id);
          return created;
        },
      });

      if (uploadFailed) {
        toast({
          title: isDraft ? 'Draft saved, but recording upload failed' : 'Could not save recording',
          description: isDraft
            ? 'Clinical note was saved without the consultation audio.'
            : 'The record remains a draft. Fix the issue and try completing again.',
          variant: 'destructive',
        });
        if (!isDraft) {
          setSaving(false);
          return;
        }
      } else if (hasPendingRecordingWithoutConsent(pending)) {
        toast({
          title: 'Record saved without recording',
          description: 'Consent id missing; consultation audio was not uploaded.',
          variant: 'destructive',
        });
      }

      await logAudit({
        action: 'CREATE',
        resource: 'medical_records',
        resource_id: data.id,
        patient_id: patient.id,
        new_value: {
          is_draft: isDraft,
          has_prescriptions: medications.length > 0,
          has_referral: !!referral.referred_to,
          has_scribe_recording: recordingSaved || !!data.has_scribe_recording,
        },
      });

      clearLegacyClinicalDraft(String(params.patientId));
      setHasChanges(false);
      autosave.setExpectedUpdatedAt(data.updated_at);
      setLoadedRecord(data);
      setSaving(false);

      toast({
        title: isDraft ? 'Draft saved' : 'Record completed',
        description: isDraft
          ? recordingSaved || data.has_scribe_recording
            ? 'Draft and consultation recording saved. You can continue editing later.'
            : 'You can continue editing later.'
          : recordingSaved || data.has_scribe_recording
            ? 'Clinical note, recording, and AI transcript saved.'
            : 'Clinical note, prescriptions, and referral saved.',
      });

      if (!isDraft) {
        router.push(`/doctor/records/${patient.id}/view/${data.id}`);
      }
    } catch (err) {
      toast({
        title: 'Failed to save',
        description: err instanceof Error ? err.message : 'Save failed',
        variant: 'destructive',
      });
      setSaving(false);
    }
  };

  // ─── Print ───
  const handlePrintPrescription = () => {
    window.print();
  };

  if (loading) {
    return (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );
  }

  if (!patient) {
    return (
        <div className="py-12 text-center">
          <p className="text-muted-foreground">Patient not found.</p>
          <Button variant="outline" onClick={() => router.push('/doctor/records')} className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Records
          </Button>
        </div>
    );
  }

  const doctorName = doctor?.profile?.full_name ?? 'Unknown Doctor';
  const patientName = patientDisplayName(patient);
  const patientAge = patient.date_of_birth
    ? `${Math.floor((Date.now() - new Date(patient.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))} years`
    : '—';
  const canSave = clinical.chief_complaint.trim().length > 0 && canMutate;
  const scribeBlocksComplete = scribeUsed && !scribeResolved;
  const canComplete = canSave && !scribeBlocksComplete && scribePhase !== 'recording' && scribePhase !== 'processing';

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
        title={!canMutate ? mutationHint : undefined}
        className="flex-1 sm:flex-none"
      >
        <Mic className="mr-2 h-4 w-4" />
        <span className="hidden sm:inline">AI Clinical Assistant</span>
        <span className="sm:hidden">AI Assist</span>
      </Button>
    );
  };

  return (
    <>
      <div className="print:hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <RecordStickyHeader
            onBack={() => router.push(`/doctor/records?patient=${patient.id}`)}
            backLabel="Back to Patient Folder"
            patientName={patientName}
            idNumber={patient.id_number}
            gender={patient.gender}
            actions={
              <>
                {(() => {
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
                  onClick={() => handleSave(false)}
                  disabled={saving || !canComplete}
                  className="flex-1 sm:flex-none"
                  title={
                    scribeBlocksComplete
                      ? 'Apply or discard AI suggestions before completing'
                      : undefined
                  }
                >
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                  <span className="hidden sm:inline">Complete &amp; Save</span>
                  <span className="sm:hidden">Complete</span>
                </Button>
              </>
            }
            tabs={<RecordSubTabs sticky={false} />}
          />

          <ConsentModal
            open={consentOpen}
            onOpenChange={setConsentOpen}
            onConfirm={() => void handleConsentConfirm()}
            mode="consultation"
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

          {/* ─── TAB 1: Clinical Notes ─── */}
          <TabsContent value="clinical" className="mt-4 space-y-4 print:hidden">
            <ConsultationEvidence
              record={loadedRecord}
              localAudio={audioBlob}
              localTranscript={aiTranscript}
            />
            <ClinicalNotesEditor
              value={clinical}
              onChange={(patch) => updateClinical(patch)}
              aiSourcedFields={aiSourcedFields}
              idPrefix="new"
            />
          </TabsContent>

          {/* ─── TAB 2: Prescription ─── */}
          <TabsContent value="prescription" className="mt-4 space-y-4 print:hidden">
            <Card>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-muted-foreground">
                    <strong>{patientName}</strong> · {patientAge} · {formatDate(new Date())}
                  </p>
                  {patient.allergies && (
                    <p className="mt-1 flex items-center gap-1 text-sm text-destructive">
                      <AlertTriangle className="h-4 w-4" />
                      Allergies: {patient.allergies}
                    </p>
                  )}
                </div>
                <Button onClick={addMedication}>
                  <Plus className="mr-2 h-4 w-4" /> Add Medication
                </Button>
              </CardContent>
            </Card>

            {medications.length === 0 ? (
              <div className="rounded-lg border border-dashed py-12 text-center">
                <Pill className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">No medications added yet.</p>
                <Button onClick={addMedication} className="mt-3" size="sm">
                  <Plus className="mr-1 h-4 w-4" /> Add First Medication
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {medications.map((med, idx) => {
              const qty = med.quantity || calcQuantity(med.duration_value, med.duration_unit, med.frequency);
              return (
                <Card key={med.id} className="animate-fade-in">
                  <CardContent className="p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm font-semibold text-muted-foreground">Medication #{idx + 1}</span>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={idx === 0} onClick={() => moveMedication(med.id, 'up')}>
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={idx === medications.length - 1} onClick={() => moveMedication(med.id, 'down')}>
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => duplicateMedication(med.id)}>
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => removeMedication(med.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Drug Name *</Label>
                        <Input value={med.drug_name} onChange={(e) => updateMedication(med.id, 'drug_name', e.target.value)} placeholder="e.g., Amlodipine" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Generic Name</Label>
                        <Input value={med.generic_name} onChange={(e) => updateMedication(med.id, 'generic_name', e.target.value)} placeholder="e.g., Amlodipine" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Brand Name</Label>
                        <Input value={med.brand_name} onChange={(e) => updateMedication(med.id, 'brand_name', e.target.value)} placeholder="e.g., Norvasc" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Strength</Label>
                        <Input value={med.strength} onChange={(e) => updateMedication(med.id, 'strength', e.target.value)} placeholder="e.g., 5mg" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Dosage Form</Label>
                        <Select value={med.dosage_form} onValueChange={(v) => updateMedication(med.id, 'dosage_form', v)}>
                          <SelectTrigger className="h-9 text-base md:h-8 md:text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                          <SelectContent>
                            {DOSAGE_FORMS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Route</Label>
                        <Select value={med.route} onValueChange={(v) => updateMedication(med.id, 'route', v)}>
                          <SelectTrigger className="h-9 text-base md:h-8 md:text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                          <SelectContent>
                            {ROUTES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Frequency</Label>
                        <Select value={med.frequency} onValueChange={(v) => updateMedication(med.id, 'frequency', v)}>
                          <SelectTrigger className="h-9 text-base md:h-8 md:text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                          <SelectContent>
                            {FREQUENCIES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex gap-2">
                        <div className="min-w-0 flex-1 space-y-1">
                          <Label className="text-xs">Duration</Label>
                          <Input type="number" value={med.duration_value} onChange={(e) => updateMedication(med.id, 'duration_value', e.target.value)} placeholder="e.g., 7" />
                        </div>
                        <div className="w-24 space-y-1">
                          <Label className="text-xs">Unit</Label>
                          <Select value={med.duration_unit} onValueChange={(v) => updateMedication(med.id, 'duration_unit', v)}>
                            <SelectTrigger className="h-9 text-base md:h-8 md:text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {DURATION_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Qty to Dispense (auto)</Label>
                        <Input
                          value={qty}
                          onChange={(e) => updateMedication(med.id, 'quantity', e.target.value)}
                          placeholder="Auto-calculated"
                        />
                      </div>
                      <div className="space-y-1 sm:col-span-2 lg:col-span-3">
                        <Label className="text-xs">Instructions for Patient</Label>
                        <Input value={med.instructions} onChange={(e) => updateMedication(med.id, 'instructions', e.target.value)} placeholder="e.g., Take with food, avoid alcohol" />
                      </div>
                      <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
                        <Checkbox
                          id={`prn-${med.id}`}
                          checked={med.is_prn}
                          onCheckedChange={(checked) => updateMedication(med.id, 'is_prn', !!checked)}
                        />
                        <Label htmlFor={`prn-${med.id}`} className="cursor-pointer text-sm font-normal">
                          PRN (As needed)
                        </Label>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
              </div>
            )}

            {/* Print button */}
            {medications.length > 0 && (
              <Button variant="outline" onClick={handlePrintPrescription} className="w-full">
                <Printer className="mr-2 h-4 w-4" /> Print Prescription
              </Button>
            )}
          </TabsContent>

          {/* ─── TAB 3: Referral ─── */}
          <TabsContent value="referral" className="mt-4 print:hidden">
            <Tabs defaultValue="referral" className="space-y-4">
              <TabsList className="grid h-auto w-full max-w-md grid-cols-2 gap-1 bg-muted/60 p-1">
                <TabsTrigger value="referral" className={RECORD_TAB_TRIGGER_CLASS}>
                  Referral
                </TabsTrigger>
                <TabsTrigger value="other-letters" className={RECORD_TAB_TRIGGER_CLASS}>
                  Others Letter
                </TabsTrigger>
              </TabsList>

              <TabsContent value="referral" className="mt-0 space-y-4">
                {/* A. Referral Details */}
                <SectionCard title="A. Referral Details" icon={<ArrowRightLeft className="h-4 w-4" />}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-sm">Referred To (Doctor Name)</Label>
                      <Input
                        value={referral.referred_to}
                        onChange={(e) => { setReferral({ ...referral, referred_to: e.target.value }); markChanged(); }}
                        placeholder="e.g., Dr. Jane Smith"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm">Specialty</Label>
                      <Select
                        value={referral.specialty}
                        onValueChange={(v) => { setReferral({ ...referral, specialty: v }); markChanged(); }}
                      >
                        <SelectTrigger><SelectValue placeholder="Select specialty..." /></SelectTrigger>
                        <SelectContent>
                          {SPECIALTIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm">Institution</Label>
                      <Input
                        value={referral.institution}
                        onChange={(e) => { setReferral({ ...referral, institution: e.target.value }); markChanged(); }}
                        placeholder="e.g., Life Healthcare, Netcare"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm">Contact (Phone/Fax/Email)</Label>
                      <Input
                        value={referral.contact}
                        onChange={(e) => { setReferral({ ...referral, contact: e.target.value }); markChanged(); }}
                        placeholder="e.g., 011 123 4567"
                      />
                    </div>
                  </div>
                </SectionCard>

                {/* B. Urgency */}
                <SectionCard title="B. Urgency Level" icon={<AlertTriangle className="h-4 w-4" />}>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {URGENCY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => { setReferral({ ...referral, urgency: opt.value }); markChanged(); }}
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
                </SectionCard>

                {/* C. Referral letter composer */}
                <SectionCard title="C. Referral Letter" icon={<FileText className="h-4 w-4" />}>
                  <ReferralLetterComposer
                    reason={referral.reason}
                    letter={referral.clinical_summary}
                    onReasonChange={(value) => {
                      setReferral({ ...referral, reason: value });
                      markChanged();
                    }}
                    onLetterChange={(value) => {
                      setReferral({ ...referral, clinical_summary: value, specific_questions: '' });
                      markChanged();
                    }}
                    patientId={patient.id}
                    patientDisplayName={patientName}
                    ageOrDobHint={
                      patient.date_of_birth
                        ? `Date of Birth: ${formatDate(patient.date_of_birth)} (${patientAge})`
                        : patientAge
                    }
                    gender={patient?.gender || null}
                    referringDoctor={{
                      fullName: doctorName,
                      practiceName: doctor?.practice_name || undefined,
                      specialization: doctor?.specialization || undefined,
                      phone: doctor?.profile?.phone || undefined,
                      email: doctor?.profile?.email || undefined,
                      hpcsa: doctor?.hpcsa_registration_number || undefined,
                    }}
                    patientContext={{
                      displayName: patientName,
                      dateOfBirthOrAge: patient.date_of_birth
                        ? `Date of Birth: ${formatDate(patient.date_of_birth)} (${patientAge})`
                        : patientAge,
                      gender: patient.gender || null,
                      phone: patient.profile?.phone || null,
                      email: patient.profile?.email || null,
                      addressLine: [patient.address, patient.city, patient.province]
                        .filter(Boolean)
                        .join(', ') || null,
                      allergies: patient.allergies || null,
                      medicalHistory: patient.medical_history || null,
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
                </SectionCard>
              </TabsContent>

              <TabsContent value="other-letters" className="mt-0">
                <SectionCard title="D. Clinical letters" icon={<FileText className="h-4 w-4" />}>
                  <ClinicalLetterComposer
                    patientId={patient.id}
                    patientDisplayName={patientName}
                    doctorDisplayName={doctorName}
                    practiceName={doctor?.practice_name || null}
                    consultationDate={new Date().toISOString().slice(0, 10)}
                    diagnosisText={clinical.primary_diagnosis || null}
                    value={clinicalLetter}
                    onChange={(next) => {
                      setClinicalLetter(next);
                      markChanged();
                    }}
                    disabled={!canMutate}
                  />
                </SectionCard>
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="notes" className="mt-4 print:hidden">
            <DoctorsNotesTab
              notes={privateNotes}
              doctorName={doctorName}
              onChange={(notes) => {
                setPrivateNotes(notes);
                markChanged();
              }}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* ─── Print Layout (Prescription) ─── */}
      {activeTab === 'prescription' && medications.length > 0 && (
        <div className="hidden print:block">
          <PrintablePrescription
            patientName={patientName}
            patientId={maskIdNumber(patient.id_number) ?? '—'}
            patientAge={patientAge}
            patientGender={patient.gender.toLowerCase()}
            doctorName={doctorName}
            hpcsaNumber={doctor?.hpcsa_registration_number ?? '—'}
            practiceName={doctor?.practice_name ?? '—'}
            doctorPhone={doctor?.profile?.phone ?? '—'}
            date={formatDate(new Date())}
            medications={medications}
            allergies={patient.allergies ?? null}
          />
        </div>
      )}

      {/* ─── Print Layout (Referral) ─── */}
      {activeTab === 'referral' && referral.referred_to && (
        <div className="hidden print:block">
          <PrintableReferral
            patientName={patientName}
            patientId={maskIdNumber(patient.id_number) ?? '—'}
            patientAge={patientAge}
            patientGender={patient.gender.toLowerCase()}
            doctorName={doctorName}
            hpcsaNumber={doctor?.hpcsa_registration_number ?? '—'}
            practiceName={doctor?.practice_name ?? '—'}
            doctorPhone={doctor?.profile?.phone ?? '—'}
            date={formatDate(new Date())}
            referral={referral}
            clinicalSummary={referral.clinical_summary || clinical.assessment || ''}
            currentMeds={medications.filter(m => m.drug_name).map(m => `${m.drug_name} ${m.strength} ${m.frequency} ${m.duration_value ? `for ${m.duration_value} ${m.duration_unit}` : ''}`)}
          />
        </div>
      )}
    </>
  );
}

// ─── Sub-components ───

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
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

// ─── Printable Prescription (A4) ───
function PrintablePrescription({
  patientName, patientId, patientAge, patientGender,
  doctorName, hpcsaNumber, practiceName, doctorPhone,
  date, medications, allergies,
}: {
  patientName: string; patientId: string; patientAge: string; patientGender: string;
  doctorName: string; hpcsaNumber: string; practiceName: string; doctorPhone: string;
  date: string; medications: MedicationItem[]; allergies: string | null;
}) {
  return (
    <div className="mx-auto max-w-[210mm] p-8 font-serif text-black">
      {/* Letterhead */}
      <div className="border-b-2 border-black pb-4">
        <h1 className="text-2xl font-bold">{practiceName}</h1>
        <p className="text-sm">Dr. {doctorName.replace('Dr. ', '')}</p>
        <p className="text-xs">HPCSA Reg: {hpcsaNumber} · Tel: {doctorPhone}</p>
      </div>

      {/* Prescription title */}
      <div className="my-4 text-center">
        <p className="text-lg font-bold uppercase tracking-widest">Prescription</p>
        <p className="text-sm">{date}</p>
      </div>

      {/* Patient details */}
      <div className="mb-4 grid grid-cols-2 gap-2 border-y py-2 text-sm">
        <p><strong>Patient:</strong> {patientName}</p>
        <p><strong>ID:</strong> {patientId}</p>
        <p><strong>Age:</strong> {patientAge}</p>
        <p><strong>Sex:</strong> {patientGender}</p>
        {allergies && <p className="col-span-2 text-red-700"><strong>ALLERGIES:</strong> {allergies}</p>}
      </div>

      {/* Medication table */}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-black">
            <th className="border-r border-black px-2 py-1 text-left">No.</th>
            <th className="border-r border-black px-2 py-1 text-left">Drug Name</th>
            <th className="border-r border-black px-2 py-1 text-left">Strength</th>
            <th className="border-r border-black px-2 py-1 text-left">Frequency</th>
            <th className="border-r border-black px-2 py-1 text-left">Duration</th>
            <th className="px-2 py-1 text-left">Qty</th>
          </tr>
        </thead>
        <tbody>
          {medications.filter(m => m.drug_name).map((med, i) => (
            <tr key={med.id} className="border-b border-gray-400">
              <td className="border-r border-gray-400 px-2 py-2">{i + 1}</td>
              <td className="border-r border-gray-400 px-2 py-2">
                {med.drug_name}
                {med.generic_name && med.generic_name !== med.drug_name && <span className="block text-xs italic">({med.generic_name})</span>}
              </td>
              <td className="border-r border-gray-400 px-2 py-2">{med.strength || '—'}</td>
              <td className="border-r border-gray-400 px-2 py-2">{med.frequency || '—'}</td>
              <td className="border-r border-gray-400 px-2 py-2">{med.duration_value ? `${med.duration_value} ${med.duration_unit}` : '—'}</td>
              <td className="px-2 py-2">{med.quantity || calcQuantity(med.duration_value, med.duration_unit, med.frequency) || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Instructions */}
      {medications.some(m => m.instructions) && (
        <div className="mt-4">
          <p className="font-bold text-sm">Instructions:</p>
          <ul className="ml-4 text-sm">
            {medications.filter(m => m.instructions).map((med, i) => (
              <li key={med.id}>{i + 1}. {med.drug_name}: {med.instructions}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer */}
      <div className="mt-12 flex items-end justify-between">
        <p className="text-xs italic">Valid for 6 months (Schedule 0-4) · Valid for 30 days (Schedule 5+)</p>
        <div className="text-center">
          <div className="border-t border-black pt-1" style={{ width: '200px' }}>
            <p className="text-sm font-bold">Dr. {doctorName.replace('Dr. ', '')}</p>
            <p className="text-xs">HPCSA: {hpcsaNumber}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Printable Referral Letter (A4) ───
function PrintableReferral({
  patientName, patientId, patientAge, patientGender,
  doctorName, hpcsaNumber, practiceName, doctorPhone,
  date, referral, clinicalSummary, currentMeds,
}: {
  patientName: string; patientId: string; patientAge: string; patientGender: string;
  doctorName: string; hpcsaNumber: string; practiceName: string; doctorPhone: string;
  date: string; referral: { referred_to: string; specialty: string; institution: string; contact: string; reason: string; urgency: ReferralUrgency; specific_questions: string };
  clinicalSummary: string; currentMeds: string[];
}) {
  const urgencyLabel = URGENCY_OPTIONS.find(u => u.value === referral.urgency)?.label ?? referral.urgency;
  return (
    <div className="mx-auto max-w-[210mm] p-8 font-serif text-black">
      {/* Letterhead */}
      <div className="border-b-2 border-black pb-4">
        <h1 className="text-2xl font-bold">{practiceName}</h1>
        <p className="text-sm">Dr. {doctorName.replace('Dr. ', '')} · HPCSA Reg: {hpcsaNumber}</p>
        <p className="text-xs">Tel: {doctorPhone}</p>
      </div>

      {/* Date */}
      <div className="my-4 flex justify-end">
        <p className="text-sm">{date}</p>
      </div>

      {/* Recipient */}
      <div className="mb-4">
        <p className="text-sm">To: <strong>{referral.referred_to}</strong></p>
        {referral.specialty && <p className="text-sm">{referral.specialty}</p>}
        {referral.institution && <p className="text-sm">{referral.institution}</p>}
        {referral.contact && <p className="text-sm">{referral.contact}</p>}
      </div>

      {/* Subject */}
      <p className="mb-4 text-sm font-bold underline">
        RE: Referral — {patientName} — {urgencyLabel}
      </p>

      {/* Patient demographics */}
      <div className="mb-4 border-y py-2 text-sm">
        <p><strong>Patient:</strong> {patientName} · <strong>ID:</strong> {patientId}</p>
        <p><strong>Age:</strong> {patientAge} · <strong>Sex:</strong> {patientGender}</p>
      </div>

      {/* Body */}
      <div className="space-y-3 text-sm">
        <p>Dear Colleague,</p>
        <p>Thank you for seeing this patient. I am referring them for the following reason:</p>
        <p className="ml-4 italic">{referral.reason || '—'}</p>

        {clinicalSummary && (
          <>
            <p className="font-bold">Clinical Summary:</p>
            <p className="ml-4 whitespace-pre-line">{clinicalSummary}</p>
          </>
        )}

        {currentMeds.length > 0 && (
          <>
            <p className="font-bold">Current Medications:</p>
            <ul className="ml-6 list-disc">
              {currentMeds.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
          </>
        )}

        {referral.specific_questions && (
          <>
            <p className="font-bold">Specific Questions:</p>
            <p className="ml-4 whitespace-pre-line">{referral.specific_questions}</p>
          </>
        )}

        <p className="mt-6">Kind regards,</p>
      </div>

      {/* Signature */}
      <div className="mt-8">
        <div className="border-t border-black pt-1" style={{ width: '250px' }}>
          <p className="text-sm font-bold">Dr. {doctorName.replace('Dr. ', '')}</p>
          <p className="text-xs">HPCSA: {hpcsaNumber}</p>
          <p className="text-xs">{practiceName}</p>
        </div>
      </div>

      {/* Footer */}
      <p className="mt-12 border-t border-gray-400 pt-2 text-center text-xs italic">
        Confidential Medical Communication
      </p>
    </div>
  );
}
