export type DraftTelephonePatient = { first_name: string; last_name: string };

export type PatientPickerSurface = 'idle' | 'search' | 'existing' | 'draft' | 'creating';

export type PatientPickerSelection = {
  patientId: string;
  draft: DraftTelephonePatient | null;
};

export function resolvePatientPickerSurface(params: {
  creating: boolean;
  draftPatient: DraftTelephonePatient | null;
  selectedPatientId: string;
  searchFocused: boolean;
  query: string;
}): PatientPickerSurface {
  if (params.creating) return 'creating';
  if (params.draftPatient) return 'draft';
  if (params.selectedPatientId) return 'existing';
  if (params.query.trim().length > 0) return 'search';
  return 'idle';
}

export function showSearchResults(surface: PatientPickerSurface): boolean {
  return surface === 'search';
}

export function showIdleSearchField(surface: PatientPickerSurface): boolean {
  return surface === 'idle' || surface === 'search';
}

export function showCreateNewPatientAction(surface: PatientPickerSurface): boolean {
  return surface === 'idle' || surface === 'search';
}

export function selectExistingPatient(patientId: string): PatientPickerSelection {
  return { patientId, draft: null };
}

export function selectNewPatientDraft(draft: DraftTelephonePatient): PatientPickerSelection {
  return { patientId: '', draft };
}

export function clearPatientSelection(): PatientPickerSelection {
  return { patientId: '', draft: null };
}

export function openCreateNewPatientFlow(): PatientPickerSelection {
  return { patientId: '', draft: null };
}
