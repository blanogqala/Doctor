function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export const TELEMEDICINE_CONFIG = {
  patientEarlyJoinMinutes: readInt('TELEMEDICINE_PATIENT_EARLY_JOIN_MINUTES', 15),
  doctorEarlyJoinMinutes: readInt('TELEMEDICINE_DOCTOR_EARLY_JOIN_MINUTES', 30),
  roomGraceAfterEndMinutes: readInt('TELEMEDICINE_ROOM_GRACE_AFTER_END_MINUTES', 15),
  tokenTtlSeconds: readInt('TELEMEDICINE_TOKEN_TTL_SECONDS', 3600),
  pollRecommendedMs: readInt('TELEMEDICINE_POLL_MS', 10_000),
};

export type TelemedicineSessionState = 'NOT_STARTED' | 'WAITING' | 'ACTIVE' | 'ENDED';

export const CLOSED_APPOINTMENT_STATUSES = new Set([
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
  'CANCELLED_NO_SHOW',
]);

export const JOINABLE_APPOINTMENT_STATUSES = new Set([
  'CONFIRMED',
  'CONFIRMED_TELEMEDICINE',
  'IN_CONSULTATION',
  'ARRIVED',
  'PENDING',
  'PENDING_IN_PERSON',
]);
