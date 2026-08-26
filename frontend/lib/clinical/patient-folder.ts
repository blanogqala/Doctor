import type {
  Appointment,
  MedicalRecord,
  Prescription,
  Referral,
} from '@/lib/types';

export type PatientFolderSection =
  | 'overview'
  | 'timeline'
  | 'consultations'
  | 'prescriptions'
  | 'referrals';

export const PATIENT_FOLDER_SECTIONS: { id: PatientFolderSection; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'consultations', label: 'Consultations' },
  { id: 'prescriptions', label: 'Prescriptions' },
  { id: 'referrals', label: 'Referrals' },
];

export type ClinicalTimelineKind =
  | 'consultation'
  | 'follow_up'
  | 'prescription'
  | 'referral'
  | 'amendment'
  | 'appointment';

export interface ClinicalTimelineEvent {
  id: string;
  kind: ClinicalTimelineKind;
  date: string;
  title: string;
  subtitle?: string;
  statusLabel?: string;
  recordId?: string;
  patientId?: string;
  href?: string;
}

export interface ConsultationTreeNode {
  parent: MedicalRecord;
  followUps: MedicalRecord[];
}

/** Age in whole years from DOB, or null if unavailable. */
export function ageFromDob(dob: string | null | undefined, now = new Date()): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

export function formatGenderLabel(gender: string | null | undefined): string | null {
  if (!gender || gender === 'UNKNOWN') return null;
  return gender.charAt(0) + gender.slice(1).toLowerCase();
}

export function doctorDisplayName(
  name: string | null | undefined,
  options?: { withPrefix?: boolean }
): string {
  const raw = (name ?? '').trim();
  if (!raw) return 'Unknown';
  const stripped = raw.replace(/^Dr\.\s*/i, '');
  return options?.withPrefix === false ? stripped : `Dr ${stripped}`;
}

export function recordComplaintSummary(record: MedicalRecord): string {
  return (
    record.chief_complaint ||
    record.subjective ||
    record.primary_diagnosis ||
    record.assessment ||
    (record.parent_record_id ? 'Follow-up' : 'Consultation')
  );
}

export function recordStatusLabel(record: MedicalRecord): 'Draft' | 'Finalized' | 'Erroneous' {
  if (record.is_erroneous) return 'Erroneous';
  return record.is_draft ? 'Draft' : 'Finalized';
}

/** Parent consultations with nested follow-ups, newest parents first. */
export function buildConsultationTree(records: MedicalRecord[]): ConsultationTreeNode[] {
  const parents = records.filter((r) => !r.parent_record_id);
  const childrenByParent = new Map<string, MedicalRecord[]>();
  for (const r of records) {
    if (!r.parent_record_id) continue;
    const list = childrenByParent.get(r.parent_record_id) ?? [];
    list.push(r);
    childrenByParent.set(r.parent_record_id, list);
  }
  return parents
    .map((parent) => ({
      parent,
      followUps: (childrenByParent.get(parent.id) ?? []).sort(
        (a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime()
      ),
    }))
    .sort(
      (a, b) =>
        new Date(b.parent.record_date).getTime() - new Date(a.parent.record_date).getTime()
    );
}

export function flattenPrescriptions(records: MedicalRecord[]): Array<
  Prescription & { record_date: string; doctor_name?: string | null }
> {
  const items: Array<Prescription & { record_date: string; doctor_name?: string | null }> = [];
  for (const r of records) {
    for (const p of r.prescriptions ?? []) {
      items.push({
        ...p,
        record_date: r.record_date,
        doctor_name: r.doctor?.profile?.full_name ?? null,
      });
    }
  }
  return items.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function flattenReferrals(records: MedicalRecord[]): Array<
  Referral & { record_date: string; doctor_name?: string | null }
> {
  const items: Array<Referral & { record_date: string; doctor_name?: string | null }> = [];
  for (const r of records) {
    for (const ref of r.referrals ?? []) {
      items.push({
        ...ref,
        record_date: r.record_date,
        doctor_name: r.doctor?.profile?.full_name ?? null,
      });
    }
  }
  return items.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export interface PatientFolderOverview {
  recordCount: number;
  draftCount: number;
  finalizedCount: number;
  latestConsultation: MedicalRecord | null;
  recentDiagnoses: string[];
  latestPrescription: (Prescription & { record_date: string }) | null;
  nextAppointment: Appointment | null;
  outstandingFollowUp: MedicalRecord | null;
}

export function buildPatientFolderOverview(
  records: MedicalRecord[],
  appointments: Appointment[] = [],
  now = new Date()
): PatientFolderOverview {
  const sorted = [...records].sort(
    (a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime()
  );
  const latestConsultation = sorted[0] ?? null;
  const draftCount = records.filter((r) => r.is_draft && !r.is_erroneous).length;
  const finalizedCount = records.filter((r) => !r.is_draft && !r.is_erroneous).length;

  const recentDiagnoses: string[] = [];
  for (const r of sorted) {
    if (r.is_draft) continue;
    const dx = r.primary_diagnosis?.trim();
    if (dx && !recentDiagnoses.includes(dx)) recentDiagnoses.push(dx);
    if (recentDiagnoses.length >= 3) break;
  }

  const rx = flattenPrescriptions(records);
  const latestPrescription = rx[0] ?? null;

  const upcoming = appointments
    .filter((a) => {
      const t = new Date(a.scheduled_at).getTime();
      return t >= now.getTime() && a.status !== 'CANCELLED' && a.status !== 'CANCELLED_NO_SHOW';
    })
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

  const outstandingFollowUp =
    sorted.find((r) => {
      if (!r.follow_up_date || r.is_erroneous) return false;
      return new Date(r.follow_up_date).getTime() >= now.getTime();
    }) ?? null;

  return {
    recordCount: records.length,
    draftCount,
    finalizedCount,
    latestConsultation,
    recentDiagnoses,
    latestPrescription,
    nextAppointment: upcoming[0] ?? null,
    outstandingFollowUp,
  };
}

/**
 * Build a newest-first clinical timeline from existing nested record data
 * plus optional appointments. Deduplicates appointments already linked to records.
 */
export function buildClinicalTimeline(
  records: MedicalRecord[],
  appointments: Appointment[] = [],
  options?: { patientId?: string; basePath?: 'doctor' | 'patient' }
): ClinicalTimelineEvent[] {
  const base = options?.basePath ?? 'doctor';
  const patientId = options?.patientId;
  const events: ClinicalTimelineEvent[] = [];
  const linkedAppointmentIds = new Set(
    records.map((r) => r.appointment_id).filter((id): id is string => Boolean(id))
  );

  for (const r of records) {
    const isFollowUp = Boolean(r.parent_record_id);
    const href =
      base === 'doctor' && patientId
        ? `/doctor/records/${patientId}/view/${r.id}`
        : `/patient/records/view/${r.id}`;

    events.push({
      id: `record-${r.id}`,
      kind: isFollowUp ? 'follow_up' : 'consultation',
      date: r.record_date,
      title: isFollowUp ? 'Follow-up' : 'Consultation',
      subtitle: [
        recordComplaintSummary(r),
        doctorDisplayName(r.doctor?.profile?.full_name),
      ]
        .filter(Boolean)
        .join(' · '),
      statusLabel: recordStatusLabel(r),
      recordId: r.id,
      patientId: r.patient_id,
      href,
    });

    for (const p of r.prescriptions ?? []) {
      events.push({
        id: `rx-${p.id}`,
        kind: 'prescription',
        date: p.created_at || r.record_date,
        title: 'Prescription',
        subtitle: [p.drug_name, p.dosage, p.frequency].filter(Boolean).join(' · '),
        recordId: r.id,
        patientId: r.patient_id,
        href,
      });
    }

    for (const ref of r.referrals ?? []) {
      events.push({
        id: `ref-${ref.id}`,
        kind: 'referral',
        date: ref.created_at || r.record_date,
        title: 'Referral',
        subtitle: [ref.specialty || ref.referred_to, ref.status].filter(Boolean).join(' · '),
        recordId: r.id,
        patientId: r.patient_id,
        href,
      });
    }

    for (const a of r.amendments ?? []) {
      events.push({
        id: `amd-${a.id}`,
        kind: 'amendment',
        date: a.created_at,
        title: 'Amendment',
        subtitle: a.correction_note.slice(0, 120),
        recordId: r.id,
        patientId: r.patient_id,
        href,
      });
    }
  }

  for (const appt of appointments) {
    if (linkedAppointmentIds.has(appt.id)) continue;
    events.push({
      id: `appt-${appt.id}`,
      kind: 'appointment',
      date: appt.scheduled_at,
      title: 'Appointment',
      subtitle: [appt.reason, appt.type?.replace(/_/g, ' ')].filter(Boolean).join(' · '),
      statusLabel: appt.status.replace(/_/g, ' ').toLowerCase(),
      patientId: appt.patient_id,
    });
  }

  return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/** Patient-facing timeline: consultations / follow-ups / visible Rx & referrals only. */
export function buildPatientFacingTimeline(records: MedicalRecord[]): ClinicalTimelineEvent[] {
  return buildClinicalTimeline(records, [], { basePath: 'patient' }).filter(
    (e) => e.kind !== 'amendment' || Boolean(e.subtitle)
  );
}

export function parseFolderSection(value: string | null): PatientFolderSection {
  const allowed = PATIENT_FOLDER_SECTIONS.map((s) => s.id);
  if (value && (allowed as string[]).includes(value)) return value as PatientFolderSection;
  return 'overview';
}
