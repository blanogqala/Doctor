import { describe, expect, it } from 'vitest';
import { buildAppointmentCreateBody } from './telephone-booking';

describe('buildAppointmentCreateBody', () => {
  const base = {
    doctor_id: 'doc-1',
    scheduled_at: '2026-09-01T08:00:00.000Z',
    duration_minutes: 30,
    type: 'IN_PERSON',
    reason: 'Call',
    status: 'CONFIRMED_IN_PERSON',
  };

  it('sends new_patient and omits patient_id for a telephone draft', () => {
    const body = buildAppointmentCreateBody({
      ...base,
      patient_id: 'should-not-send',
      draftPatient: { first_name: 'Nomsa', last_name: 'Dlamini' },
    });
    expect(body.patient_id).toBeUndefined();
    expect(body.new_patient).toEqual({ first_name: 'Nomsa', last_name: 'Dlamini' });
  });

  it('sends patient_id for an existing patient and does not create a draft patient payload', () => {
    const body = buildAppointmentCreateBody({
      ...base,
      patient_id: 'lindiwe-id',
      draftPatient: null,
    });
    expect(body.patient_id).toBe('lindiwe-id');
    expect(body.new_patient).toBeUndefined();
  });

  it('never includes both patient_id and new_patient', () => {
    const draftBody = buildAppointmentCreateBody({
      ...base,
      patient_id: 'lindiwe-id',
      draftPatient: { first_name: 'Bathandwa', last_name: 'Nogqala' },
    });
    expect(Object.keys(draftBody)).not.toContain('patient_id');
    expect(draftBody.new_patient).toEqual({ first_name: 'Bathandwa', last_name: 'Nogqala' });

    const existingBody = buildAppointmentCreateBody({
      ...base,
      patient_id: 'lindiwe-id',
      draftPatient: null,
    });
    expect(existingBody.patient_id).toBe('lindiwe-id');
    expect(Object.keys(existingBody)).not.toContain('new_patient');
  });
});
