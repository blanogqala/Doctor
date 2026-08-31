import { describe, expect, it } from 'vitest';
import {
  clearPatientSelection,
  openCreateNewPatientFlow,
  resolvePatientPickerSurface,
  selectExistingPatient,
  selectNewPatientDraft,
  showCreateNewPatientAction,
  showIdleSearchField,
  showSearchResults,
} from './patient-picker-ui';
import { buildAppointmentCreateBody } from './telephone-booking';

const bookingBase = {
  doctor_id: 'doc-1',
  scheduled_at: '2026-09-01T08:00:00.000Z',
  duration_minutes: 30,
  type: 'IN_PERSON',
  reason: 'Call',
  status: 'CONFIRMED_IN_PERSON',
};

const lindiweId = 'lindiwe-id';
const bathandwa = { first_name: 'Bathandwa', last_name: 'Nogqala' };

describe('patient picker surfaces', () => {
  it('TEST 1: no selection shows search and Create new patient, not search results', () => {
    const surface = resolvePatientPickerSurface({
      creating: false,
      draftPatient: null,
      selectedPatientId: '',
      searchFocused: false,
      query: '',
    });
    expect(surface).toBe('idle');
    expect(showIdleSearchField(surface)).toBe(true);
    expect(showCreateNewPatientAction(surface)).toBe(true);
    expect(showSearchResults(surface)).toBe(false);
  });

  it('TEST 2: matching patients appear only in search-result state', () => {
    const idle = resolvePatientPickerSurface({
      creating: false,
      draftPatient: null,
      selectedPatientId: '',
      searchFocused: false,
      query: '',
    });
    expect(showSearchResults(idle)).toBe(false);

    const focused = resolvePatientPickerSurface({
      creating: false,
      draftPatient: null,
      selectedPatientId: '',
      searchFocused: true,
      query: '',
    });
    expect(focused).toBe('idle');
    expect(showSearchResults(focused)).toBe(false);

    const queried = resolvePatientPickerSurface({
      creating: false,
      draftPatient: null,
      selectedPatientId: '',
      searchFocused: false,
      query: 'Lindiwe',
    });
    expect(queried).toBe('search');
    expect(showSearchResults(queried)).toBe(true);
  });

  it('TEST 3: selecting Lindiwe is existing-only; payload uses patient_id', () => {
    const selection = selectExistingPatient(lindiweId);
    expect(selection.patientId).toBe(lindiweId);
    expect(selection.draft).toBeNull();
    const surface = resolvePatientPickerSurface({
      creating: false,
      draftPatient: selection.draft,
      selectedPatientId: selection.patientId,
      searchFocused: true,
      query: 'Lindiwe',
    });
    expect(surface).toBe('existing');
    expect(showSearchResults(surface)).toBe(false);
    const body = buildAppointmentCreateBody({
      ...bookingBase,
      patient_id: selection.patientId,
      draftPatient: selection.draft,
    });
    expect(body.patient_id).toBe(lindiweId);
    expect(body.new_patient).toBeUndefined();
  });

  it('TEST 4: Bathandwa draft hides results and sends new_patient only', () => {
    const afterExisting = selectExistingPatient(lindiweId);
    const selection = selectNewPatientDraft(bathandwa);
    expect(afterExisting.patientId).toBe(lindiweId);
    expect(selection.patientId).toBe('');
    expect(selection.draft).toEqual(bathandwa);
    const surface = resolvePatientPickerSurface({
      creating: false,
      draftPatient: selection.draft,
      selectedPatientId: selection.patientId,
      searchFocused: true,
      query: 'Lindiwe',
    });
    expect(surface).toBe('draft');
    expect(showSearchResults(surface)).toBe(false);
    const body = buildAppointmentCreateBody({
      ...bookingBase,
      patient_id: lindiweId,
      draftPatient: selection.draft,
    });
    expect(body.patient_id).toBeUndefined();
    expect(body.new_patient).toEqual(bathandwa);
  });

  it('TEST 5: Change patient from draft then select existing leaves only existing', () => {
    let selection = selectNewPatientDraft(bathandwa);
    selection = clearPatientSelection();
    selection = selectExistingPatient(lindiweId);
    expect(selection.draft).toBeNull();
    expect(selection.patientId).toBe(lindiweId);
    const surface = resolvePatientPickerSurface({
      creating: false,
      draftPatient: selection.draft,
      selectedPatientId: selection.patientId,
      searchFocused: false,
      query: '',
    });
    expect(surface).toBe('existing');
    expect(showSearchResults(surface)).toBe(false);
  });

  it('TEST 6: Create new patient from existing clears selection; only draft remains after submit', () => {
    let selection = selectExistingPatient(lindiweId);
    selection = openCreateNewPatientFlow();
    expect(selection.patientId).toBe('');
    expect(selection.draft).toBeNull();
    expect(
      resolvePatientPickerSurface({
        creating: true,
        draftPatient: selection.draft,
        selectedPatientId: selection.patientId,
        searchFocused: false,
        query: '',
      })
    ).toBe('creating');
    selection = selectNewPatientDraft(bathandwa);
    expect(selection.patientId).toBe('');
    expect(selection.draft).toEqual(bathandwa);
    expect(
      resolvePatientPickerSurface({
        creating: false,
        draftPatient: selection.draft,
        selectedPatientId: selection.patientId,
        searchFocused: false,
        query: '',
      })
    ).toBe('draft');
  });
});
