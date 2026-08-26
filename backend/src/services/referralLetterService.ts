import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { groqFetch } from './groqClient';

const GROQ_BASE = 'https://api.groq.com/openai/v1';
const LLM_MODEL = 'llama-3.3-70b-versatile';

function requireGroqKey(): string {
  if (!env.GROQ_API_KEY) {
    throw new AppError(
      503,
      'AI referral letters are not configured. Set GROQ_API_KEY on the server.'
    );
  }
  return env.GROQ_API_KEY;
}

async function chatCompletion(system: string, user: string): Promise<string> {
  const apiKey = requireGroqKey();

  const res = await groqFetch(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });

  if (!res.ok) {
    let detail = 'Referral letter AI request failed';
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      detail = body.error?.message || detail;
    } catch {
      // ignore
    }
    throw new AppError(502, detail);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new AppError(502, 'Empty response from AI');
  }

  let parsed: { letter?: string };
  try {
    parsed = JSON.parse(content) as { letter?: string };
  } catch {
    throw new AppError(502, 'AI returned invalid JSON');
  }

  const letter = typeof parsed.letter === 'string' ? parsed.letter.trim() : '';
  if (!letter) {
    throw new AppError(502, 'AI did not return a letter');
  }
  return letter;
}

const ENHANCE_SYSTEM = `You are a medical writing assistant for South African doctors.
Polish the doctor's formal clinical referral letter into clear professional English.

Preserve this formal block structure when present (do not collapse into a free-form email):
- Referring practice letterhead
- Date
- To: recipient block
- Salutation and Re: line (patient + urgency)
- Labeled sections (Clinical Details, Medications/Allergies, Investigations, Reason for Referral, Patient contact)
- Collaborative closing
- Yours sincerely + referring doctor credentials

Rules:
- Keep all clinical facts exactly as provided; do not invent findings, diagnoses, labs, imaging, addresses, or allergies.
- Preserve urgency/priority and clinical timeline (onset/duration).
- Do not add citations, bibliographic references, footnotes, or fabricated "enclosed results".
- Improve tone, clarity, and formatting only (plain text, blank lines between blocks, no markdown).
- Return JSON only: { "letter": "..." }.`;

const DRAFT_SYSTEM = `You are a medical writing assistant for South African doctors.
Draft a formal clinical referral letter from the structured session JSON.

Use this plain-text layout (blank line between blocks; no markdown). Omit any section whose data is absent:

[Referring practice letterhead from referringDoctor — practice name, doctor name, specialization, phone, email, HPCSA as available]
[letterDate]

To:
[referral.referred_to]
[Specialty / institution / contact lines only if provided]

Dear [referred doctor surname or "Colleague"],

Re: Referral for [patient.displayName], [dateOfBirthOrAge if known]; Urgency: [referral.urgencyLabel or referral.urgency]

[One opening sentence stating you are referring the patient for evaluation/management of the presenting problem / reason.]

Clinical Details:
Presenting Complaint: ...
Duration / History: ...   (from history_present_illness — onset/duration/course)
Relevant Findings: ...    (exam, vitals, ROS, appearance, assessment, primary diagnosis, differentials, severity — only if present)
Past Medical History: ... (from patient.medicalHistory if provided)

Current Medications: ...  (omit line if none)
Allergies: ...            (omit line if none)

Investigations:           (OMIT this entire heading/section unless clinical.investigations_summary is non-empty; never invent tests)

Reason for Referral:
[reason / ask / specific_questions; state why specialist input is needed]

Patient's Contact Information:  (OMIT entire section if no phone/email/address)
Phone Number: ...
Email Address: ...
Address: ...

[Collaborative close: thank the specialist; offer to share further information or discuss. Do NOT claim results are enclosed unless Investigations section exists.]

Yours sincerely,

[referringDoctor.fullName]
[specialization / practiceName]
[phone / email / HPCSA lines as available]

Hard rules:
- Use only provided fields. Do not invent history, findings, diagnoses, plans, labs, imaging, timelines, contact details, or allergies.
- Do not include national ID, passport numbers, or private doctor notes.
- Do not add citations, references, footnotes, or fabricated proof.
- If clinical data is sparse, keep the formal skeleton but write short honest content; still include urgency and reason when available. Avoid apology-padding.
- Professional English for a specialist colleague in South Africa.
- Return JSON only: { "letter": "..." }.`;

export async function enhanceReferralLetter(letter: string): Promise<string> {
  const trimmed = letter.trim();
  if (!trimmed) {
    throw new AppError(400, 'letter is required');
  }
  if (trimmed.length > 20000) {
    throw new AppError(400, 'letter is too long');
  }
  return chatCompletion(
    ENHANCE_SYSTEM,
    `Polish this referral letter:\n\n${trimmed}`
  );
}

export interface ReferralDraftInput {
  patientDisplayName: string;
  letterDate?: string | null;
  ageOrDobHint?: string | null;
  gender?: string | null;
  referringDoctor?: {
    fullName?: string | null;
    practiceName?: string | null;
    specialization?: string | null;
    phone?: string | null;
    email?: string | null;
    hpcsa?: string | null;
  } | null;
  patient?: {
    displayName?: string | null;
    dateOfBirthOrAge?: string | null;
    gender?: string | null;
    phone?: string | null;
    email?: string | null;
    addressLine?: string | null;
    allergies?: string | null;
    medicalHistory?: string | null;
  } | null;
  clinical: {
    chief_complaint?: string | null;
    history_present_illness?: string | null;
    assessment?: string | null;
    plan?: string | null;
    primary_diagnosis?: string | null;
    physical_exam_notes?: string | null;
    medications_summary?: string | null;
    severity?: string | null;
    general_appearance?: string | null;
    differential_diagnoses?: string | null;
    vitals_summary?: string | null;
    positive_ros_summary?: string | null;
    investigations_summary?: string | null;
  };
  referral: {
    referred_to?: string | null;
    specialty?: string | null;
    institution?: string | null;
    contact?: string | null;
    reason?: string | null;
    urgency?: string | null;
    urgencyLabel?: string | null;
    specific_questions?: string | null;
  };
}

export async function draftReferralLetter(input: ReferralDraftInput): Promise<string> {
  const name = (input.patientDisplayName || input.patient?.displayName || '').trim();
  if (!name) {
    throw new AppError(400, 'patientDisplayName is required');
  }

  const patient = {
    displayName: input.patient?.displayName || name,
    dateOfBirthOrAge:
      input.patient?.dateOfBirthOrAge || input.ageOrDobHint || null,
    gender: input.patient?.gender || input.gender || null,
    phone: input.patient?.phone || null,
    email: input.patient?.email || null,
    addressLine: input.patient?.addressLine || null,
    allergies: input.patient?.allergies || null,
    medicalHistory: input.patient?.medicalHistory || null,
  };

  const payload = {
    letterDate: input.letterDate || null,
    referringDoctor: input.referringDoctor || null,
    patient,
    clinical: input.clinical || {},
    referral: input.referral || {},
  };

  return chatCompletion(
    DRAFT_SYSTEM,
    `Draft a formal referral letter from this session data (JSON):\n${JSON.stringify(payload, null, 2)}`
  );
}
