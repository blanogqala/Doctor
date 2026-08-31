import type { Patient } from '@/lib/types';

export function patientDisplayName(
  patient:
    | Pick<Patient, 'first_name' | 'last_name' | 'full_name' | 'profile'>
    | null
    | undefined
): string {
  if (!patient) return 'Unknown';
  const first = patient.first_name?.trim() ?? '';
  const last = patient.last_name?.trim() ?? '';
  if (first && last && first !== last) return `${first} ${last}`;
  if (first) return first;
  if (last) return last;
  const fromFull = patient.full_name?.trim();
  if (fromFull) return fromFull;
  const fromProfile = patient.profile?.full_name?.trim();
  if (fromProfile) return fromProfile;
  return 'Unknown';
}

export function patientEmail(patient: Pick<Patient, 'email' | 'profile'> | null | undefined): string {
  return (patient?.email || patient?.profile?.email || '').trim();
}

export function findSimilarPatients(
  patients: Patient[],
  firstName: string,
  lastName: string
): Patient[] {
  const first = firstName.trim().toLowerCase();
  const last = lastName.trim().toLowerCase();
  if (!first || !last) return [];
  return patients.filter((p) => {
    const pf = (p.first_name || '').trim().toLowerCase();
    const pl = (p.last_name || '').trim().toLowerCase();
    if (pf === first && pl === last) return true;
    const display = patientDisplayName(p).toLowerCase();
    return display === `${first} ${last}`;
  });
}
