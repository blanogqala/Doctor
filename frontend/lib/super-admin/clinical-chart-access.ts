import type { ClinicalChartAccessMode } from '@/lib/clinical/chart-access';
import { CLINICAL_CHART_ACCESS_LABELS } from '@/lib/clinical/chart-access';

export type ClinicalChartAccessChangeDirection = 'ENABLE_ALL' | 'RESTRICT_ASSIGNED' | null;

export const ENABLE_ALL_CONFIRMATION = {
  title: 'Enable Practice-wide Doctor chart access?',
  body: 'All active Doctors in this Practice will be able to access patient clinical charts, including records created by other Doctors.\n\nReception and MediNathi Super Admin will still not receive clinical access.\n\nRecord editing, consultation audio, appointments and telemedicine remain restricted to their existing owners.\n\nEnable this only when the Practice has requested this access model.',
  confirmLabel: 'Enable Practice-wide Access',
} as const;

export const RESTRICT_ASSIGNED_CONFIRMATION = {
  title: 'Use assigned doctor only?',
  body: "Doctors who are not assigned to a patient will immediately lose access to that patient's clinical chart.\n\nExisting MedicalRecords will not be deleted or reassigned.",
  confirmLabel: 'Use Assigned Doctor Only',
} as const;

export const CLINICAL_CHART_ACCESS_OPTIONS: Array<{
  mode: ClinicalChartAccessMode;
  label: string;
  description: string;
  recommended?: boolean;
}> = [
  {
    mode: 'ASSIGNED_DOCTOR_ONLY',
    label: CLINICAL_CHART_ACCESS_LABELS.ASSIGNED_DOCTOR_ONLY,
    description: "Only the patient's assigned Doctor can access the clinical chart.",
    recommended: true,
  },
  {
    mode: 'ALL_ACTIVE_DOCTORS',
    label: CLINICAL_CHART_ACCESS_LABELS.ALL_ACTIVE_DOCTORS,
    description:
      'Any active Doctor in this Practice can access patient charts and create their own clinical records.',
  },
];

export function clinicalChartAccessChangeDirection(
  current: ClinicalChartAccessMode | string | null | undefined,
  next: ClinicalChartAccessMode
): ClinicalChartAccessChangeDirection {
  if (current === next) return null;
  if (next === 'ALL_ACTIVE_DOCTORS') return 'ENABLE_ALL';
  if (next === 'ASSIGNED_DOCTOR_ONLY') return 'RESTRICT_ASSIGNED';
  return null;
}

export function confirmationForChartAccessChange(direction: ClinicalChartAccessChangeDirection) {
  if (direction === 'ENABLE_ALL') return ENABLE_ALL_CONFIRMATION;
  if (direction === 'RESTRICT_ASSIGNED') return RESTRICT_ASSIGNED_CONFIRMATION;
  return null;
}
