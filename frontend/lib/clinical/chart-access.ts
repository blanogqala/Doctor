export type ClinicalChartAccessMode = 'ASSIGNED_DOCTOR_ONLY' | 'ALL_ACTIVE_DOCTORS';

export const CLINICAL_CHART_ACCESS_LABELS: Record<ClinicalChartAccessMode, string> = {
  ASSIGNED_DOCTOR_ONLY: 'Assigned doctor only',
  ALL_ACTIVE_DOCTORS: 'All active doctors in this Practice',
};

export const PRACTICE_WIDE_CHART_BANNER =
  'Practice-wide chart access is enabled. You can access clinical charts for patients in this Practice. Records remain editable only by their author.';

export const SHARED_CHART_ACCESS_BADGE = 'Shared chart access';

export const PRACTICE_OWNER_CHART_ACCESS_NOTE = 'Managed by MediNathi Super Admin.';

export function clinicalChartAccessLabel(
  mode: ClinicalChartAccessMode | string | null | undefined
): string {
  if (mode === 'ALL_ACTIVE_DOCTORS') return CLINICAL_CHART_ACCESS_LABELS.ALL_ACTIVE_DOCTORS;
  return CLINICAL_CHART_ACCESS_LABELS.ASSIGNED_DOCTOR_ONLY;
}

export function isPracticeWideChartAccess(
  mode: ClinicalChartAccessMode | string | null | undefined
): boolean {
  return mode === 'ALL_ACTIVE_DOCTORS';
}

export function isSharedChartAccess(params: {
  mode: ClinicalChartAccessMode | string | null | undefined;
  currentDoctorId?: string | null;
  assignedDoctorId?: string | null;
}): boolean {
  return (
    isPracticeWideChartAccess(params.mode) &&
    Boolean(params.currentDoctorId) &&
    params.assignedDoctorId !== params.currentDoctorId
  );
}

export function checkupDoctorsForPolicy<T extends { id: string }>(params: {
  doctors: T[];
  mode: ClinicalChartAccessMode | string | null | undefined;
  assignedDoctorId?: string | null;
}): T[] {
  if (
    params.mode === 'ASSIGNED_DOCTOR_ONLY' &&
    params.assignedDoctorId
  ) {
    const assigned = params.doctors.filter((d) => d.id === params.assignedDoctorId);
    return assigned.length > 0 ? assigned : params.doctors;
  }
  return params.doctors;
}
