export type UserRole = 'ADMIN' | 'DOCTOR' | 'PATIENT';

export type AppointmentType = 'IN_PERSON' | 'TELEMEDICINE';
export type AppointmentStatus =
  | 'PENDING'
  | 'PENDING_IN_PERSON'
  | 'CONFIRMED'
  | 'CONFIRMED_IN_PERSON'
  | 'CONFIRMED_TELEMEDICINE'
  | 'ARRIVED'
  | 'IN_CONSULTATION'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'CANCELLED_NO_SHOW'
  | 'NO_SHOW';

export type TelemedicinePatientDecision =
  | 'PENDING'
  | 'ACCEPTED_VIDEO'
  | 'SWITCHED_IN_PERSON';

export type PaymentStatus = 'UNPAID' | 'PAID' | 'VOID';
export type PaymentMethod = 'CASH' | 'EFT' | 'CARD' | 'MEDICAL_AID';
/** Canonical contract — must match Prisma ReferralUrgency. */
export type ReferralUrgency = 'ROUTINE' | 'URGENT';

export type ClinicalLetterDocumentType =
  | 'MEDICAL_CERTIFICATE'
  | 'WORK_ATTENDANCE'
  | 'SCHOOL_ATTENDANCE';

export interface ClinicalLetterSaved {
  document_type?: ClinicalLetterDocumentType | string;
  absence_start?: string | null;
  absence_end?: string | null;
  restrictions?: string | null;
  include_diagnosis?: boolean;
  doctor_notes?: string | null;
  letter?: string;
  approved?: boolean;
}

export const REFERRAL_URGENCY_VALUES = ['ROUTINE', 'URGENT'] as const satisfies readonly ReferralUrgency[];

export type ScribeTranscriptStatus = 'PROCESSING' | 'READY' | 'FAILED';

export type AiFieldProvenanceSource =
  | 'AI'
  | 'DOCTOR'
  | 'AI_ACCEPTED'
  | 'AI_ACCEPTED_AND_EDITED';

export interface AiFieldProvenanceEntry {
  source: AiFieldProvenanceSource;
  model?: string;
  generatedAt?: string;
  acceptedAt?: string;
  acceptedByDoctorId?: string;
  modifiedAfterAcceptance?: boolean;
}

export type AiFieldProvenanceMap = Record<string, AiFieldProvenanceEntry>;
export type ReferralStatus = 'pending' | 'sent' | 'acknowledged' | 'completed';
export type PrescriptionStatus = 'active' | 'completed' | 'cancelled';
export type Severity = 'MILD' | 'MODERATE' | 'SEVERE' | null;
export type GenderType = 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  phone: string | null;
  is_active: boolean;
  activated_at?: string | null;
  last_login_at: string | null;
  soft_deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Doctor {
  id: string;
  profile_id: string;
  hpcsa_registration_number: string | null;
  practice_name: string;
  specialization: string;
  is_verified: boolean;
  consultation_fee_cents: number;
  telemedicine_fee_cents?: number;
  bio: string | null;
  credentials?: string[];
  created_at: string;
  updated_at: string;
  profile?: Profile;
}

export type PatientRegistrationSource = 'SELF_REGISTERED' | 'RECEPTION_CREATED';
export type PatientPortalStatus = 'NO_PORTAL_ACCESS' | 'INVITED' | 'ACTIVE' | 'DISABLED';

export interface Patient {
  id: string;
  profile_id: string | null;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  email?: string | null;
  phone?: string | null;
  registration_source?: PatientRegistrationSource;
  portal_status?: PatientPortalStatus;
  portal_invitation_sent_at?: string | null;
  id_number: string | null;
  id_number_last4: string | null;
  date_of_birth: string | null;
  gender: GenderType;
  address: string | null;
  city: string | null;
  province: string | null;
  medical_aid_provider: string | null;
  medical_aid_number: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  assigned_doctor_id: string | null;
  consent_telemedicine?: boolean;
  medical_history?: string | null;
  allergies?: string | null;
  current_medications?: string | null;
  soft_deleted_at: string | null;
  created_at: string;
  updated_at: string;
  profile?: Profile | null;
  assigned_doctor?: Doctor;
}

export interface Appointment {
  id: string;
  patient_id: string;
  doctor_id: string;
  created_by: string | null;
  scheduled_at: string;
  duration_minutes: number;
  type: AppointmentType;
  status: AppointmentStatus;
  reason: string | null;
  cancellation_reason: string | null;
  notes: string | null;
  locked_by_doctor_id: string | null;
  consultation_started_at: string | null;
  doctor_joined_at: string | null;
  patient_joined_at: string | null;
  delay_minutes: number;
  reminder_sent_at: string | null;
  parent_record_id: string | null;
  patient_telemedicine_decision: TelemedicinePatientDecision | null;
  patient_telemedicine_decided_at: string | null;
  telemedicine_room_id: string | null;
  telemedicine_started_at: string | null;
  telemedicine_ended_at: string | null;
  soft_deleted_at: string | null;
  created_at: string;
  updated_at: string;
  patient?: Patient;
  doctor?: Doctor;
  medical_records?: MedicalRecord[];
}

export interface AvailabilityWindow {
  id: string;
  doctor_id: string;
  date: string;
  start_minute: number;
  end_minute: number;
  created_at: string;
}

export interface AppointmentSlot {
  start: string;
  end: string;
}

export interface VitalSigns {
  bp_systolic?: number | null;
  bp_diastolic?: number | null;
  hr?: number | null;
  temp?: number | null;
  rr?: number | null;
  spo2?: number | null;
  weight?: number | null;
  height?: number | null;
  bmi?: number | null;
}

export interface DoctorPrivateNote {
  id: string;
  heading: string;
  content: string;
  author_name: string;
  author_id?: string | null;
  created_at: string;
}

export interface MedicalRecord {
  id: string;
  practice_id?: string;
  patient_id: string;
  doctor_id: string;
  appointment_id: string | null;
  parent_record_id: string | null;
  record_date: string;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  diagnosis_codes: string[];
  is_erroneous: boolean;
  soft_deleted_at: string | null;
  created_at: string;
  updated_at: string;
  chief_complaint: string | null;
  history_present_illness: string | null;
  review_of_systems: Record<string, boolean> | null;
  physical_examination: Record<string, string> | null;
  vital_signs: VitalSigns | null;
  general_appearance: string | null;
  primary_diagnosis: string | null;
  differential_diagnoses: string[] | null;
  severity: Severity;
  lifestyle_advice: string | null;
  follow_up_date: string | null;
  is_draft: boolean;
  doctor_notes_private: DoctorPrivateNote[] | string | null;
  has_scribe_recording?: boolean;
  scribe_transcript?: string | null;
  scribe_detected_language?: string | null;
  scribe_warnings?: string[] | null;
  scribe_confidence?: Record<string, number> | null;
  scribe_recorded_at?: string | null;
  scribe_status?: ScribeTranscriptStatus | null;
  ai_field_provenance?: AiFieldProvenanceMap | null;
  patient?: Patient;
  doctor?: Doctor;
  appointment?: Appointment | null;
  check_ups?: MedicalRecord[];
  prescriptions?: Prescription[];
  amendments?: MedicalRecordAmendment[];
  referrals?: Referral[];
  clinical_letters?: ClinicalLetterSaved[] | null;
}

export interface MedicalRecordAmendment {
  id: string;
  medical_record_id: string;
  doctor_id: string;
  correction_note: string;
  created_at: string;
}

export interface Prescription {
  id: string;
  medical_record_id: string;
  patient_id: string;
  doctor_id: string;
  drug_name: string;
  dosage: string;
  frequency: string;
  duration: string | null;
  instructions: string | null;
  generic_name: string | null;
  brand_name: string | null;
  strength: string | null;
  dosage_form: string | null;
  route: string | null;
  quantity: number | null;
  is_prn: boolean;
  status: PrescriptionStatus;
  created_at: string;
}

export interface Referral {
  id: string;
  medical_record_id: string | null;
  patient_id: string;
  doctor_id: string;
  referred_to: string;
  specialty: string | null;
  reason: string;
  urgency: ReferralUrgency;
  created_at: string;
  referred_to_institution: string | null;
  referred_to_contact: string | null;
  clinical_summary: string | null;
  specific_questions: string | null;
  status: ReferralStatus;
  sent_at: string | null;
}

export interface TelemedicineConsent {
  id: string;
  patient_id: string;
  consent_given: boolean;
  consent_text_hash: string | null;
  ip_address: string | null;
  user_agent: string | null;
  signed_at: string;
}

export interface Payment {
  id: string;
  appointment_id: string | null;
  patient_id: string;
  amount_cents: number;
  status: PaymentStatus;
  method: PaymentMethod | null;
  paid_at: string | null;
  void_reason: string | null;
  invoice_number: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  patient?: Patient;
  appointment?: Appointment;
}

export type MessageType = 'CHAT' | 'SYSTEM';

export interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  patient_id: string;
  appointment_id: string | null;
  type: MessageType;
  body: string;
  read_at: string | null;
  created_at: string;
  sender?: Profile;
  recipient?: Profile;
  patient?: Patient;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  resource: string;
  resource_id: string | null;
  patient_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  actor?: Profile;
}

export type PracticeAccessMode = 'FULL' | 'READ_ONLY' | 'BLOCKED';
export type PracticeAccessReason =
  | 'BILLING_OVERDUE'
  | 'MANUAL_SUSPENSION'
  | 'CANCELLED'
  | 'ONBOARDING_TRIAL_EXPIRED'
  | null;

export type ClinicalChartAccessMode = 'ASSIGNED_DOCTOR_ONLY' | 'ALL_ACTIVE_DOCTORS';

export interface PracticeAccessState {
  mode: PracticeAccessMode;
  reason?: PracticeAccessReason | null;
  suspended_at?: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  practice_id?: string;
  practice?: {
    id: string;
    subdomain: string;
    clinic_name: string;
    logo_url: string | null;
    brand_color: string;
    subscription_status: string;
    trial_ends_at: string | null;
    subscription_ends_at: string | null;
    access?: PracticeAccessState | null;
    clinical_chart_access_mode?: ClinicalChartAccessMode | null;
  } | null;
  profile: Profile | null;
  doctor: Doctor | null;
  patient: Patient | null;
  is_practice_owner?: boolean;
}
