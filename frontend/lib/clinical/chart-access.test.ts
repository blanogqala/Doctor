import { describe, expect, it } from 'vitest';
import {
  checkupDoctorsForPolicy,
  clinicalChartAccessLabel,
  isPracticeWideChartAccess,
  isSharedChartAccess,
  PRACTICE_OWNER_CHART_ACCESS_NOTE,
  PRACTICE_WIDE_CHART_BANNER,
  SHARED_CHART_ACCESS_BADGE,
} from './chart-access';

describe('clinical chart access helpers', () => {
  it('labels ASSIGNED and ALL modes', () => {
    expect(clinicalChartAccessLabel('ASSIGNED_DOCTOR_ONLY')).toBe('Assigned doctor only');
    expect(clinicalChartAccessLabel('ALL_ACTIVE_DOCTORS')).toBe(
      'All active doctors in this Practice'
    );
  });

  it('shared badge only for non-assigned Doctors under ALL mode', () => {
    expect(
      isSharedChartAccess({
        mode: 'ALL_ACTIVE_DOCTORS',
        currentDoctorId: 'd2',
        assignedDoctorId: 'd1',
      })
    ).toBe(true);
    expect(
      isSharedChartAccess({
        mode: 'ALL_ACTIVE_DOCTORS',
        currentDoctorId: 'd1',
        assignedDoctorId: 'd1',
      })
    ).toBe(false);
    expect(
      isSharedChartAccess({
        mode: 'ASSIGNED_DOCTOR_ONLY',
        currentDoctorId: 'd2',
        assignedDoctorId: 'd1',
      })
    ).toBe(false);
  });

  it('check-up doctor options restrict to assigned Doctor under ASSIGNED mode', () => {
    const doctors = [{ id: 'd1' }, { id: 'd2' }];
    expect(
      checkupDoctorsForPolicy({
        doctors,
        mode: 'ASSIGNED_DOCTOR_ONLY',
        assignedDoctorId: 'd1',
      })
    ).toEqual([{ id: 'd1' }]);
    expect(
      checkupDoctorsForPolicy({
        doctors,
        mode: 'ALL_ACTIVE_DOCTORS',
        assignedDoctorId: 'd1',
      })
    ).toEqual(doctors);
  });

  it('exposes Doctor directory copy and Owner read-only note', () => {
    expect(isPracticeWideChartAccess('ALL_ACTIVE_DOCTORS')).toBe(true);
    expect(PRACTICE_WIDE_CHART_BANNER).toMatch(/Practice-wide chart access is enabled/);
    expect(SHARED_CHART_ACCESS_BADGE).toBe('Shared chart access');
    expect(PRACTICE_OWNER_CHART_ACCESS_NOTE).toMatch(/Managed by MediNathi Super Admin/);
  });
});
