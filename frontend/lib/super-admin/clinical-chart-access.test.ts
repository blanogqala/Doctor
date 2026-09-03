import { describe, expect, it } from 'vitest';
import {
  CLINICAL_CHART_ACCESS_OPTIONS,
  clinicalChartAccessChangeDirection,
  confirmationForChartAccessChange,
  ENABLE_ALL_CONFIRMATION,
  RESTRICT_ASSIGNED_CONFIRMATION,
} from './clinical-chart-access';

describe('Super Admin clinical chart access UI contract', () => {
  it('renders both modes with recommended default copy', () => {
    expect(CLINICAL_CHART_ACCESS_OPTIONS.map((o) => o.mode)).toEqual([
      'ASSIGNED_DOCTOR_ONLY',
      'ALL_ACTIVE_DOCTORS',
    ]);
    expect(CLINICAL_CHART_ACCESS_OPTIONS[0]?.recommended).toBe(true);
    expect(CLINICAL_CHART_ACCESS_OPTIONS[0]?.label).toBe('Assigned doctor only');
    expect(CLINICAL_CHART_ACCESS_OPTIONS[1]?.label).toBe('All active doctors in this Practice');
  });

  it('enabling ALL requires confirmation', () => {
    expect(clinicalChartAccessChangeDirection('ASSIGNED_DOCTOR_ONLY', 'ALL_ACTIVE_DOCTORS')).toBe(
      'ENABLE_ALL'
    );
    const confirm = confirmationForChartAccessChange('ENABLE_ALL');
    expect(confirm?.title).toBe(ENABLE_ALL_CONFIRMATION.title);
    expect(confirm?.confirmLabel).toBe('Enable Practice-wide Access');
    expect(confirm?.body).toMatch(/Reception and MediNathi Super Admin will still not receive clinical access/);
  });

  it('restricting back requires confirmation', () => {
    expect(clinicalChartAccessChangeDirection('ALL_ACTIVE_DOCTORS', 'ASSIGNED_DOCTOR_ONLY')).toBe(
      'RESTRICT_ASSIGNED'
    );
    const confirm = confirmationForChartAccessChange('RESTRICT_ASSIGNED');
    expect(confirm?.title).toBe(RESTRICT_ASSIGNED_CONFIRMATION.title);
    expect(confirm?.confirmLabel).toBe('Use Assigned Doctor Only');
    expect(confirm?.body).toMatch(/immediately lose access/);
    expect(confirm?.body).toMatch(/will not be deleted or reassigned/);
  });

  it('same-state change is not a confirmation event', () => {
    expect(clinicalChartAccessChangeDirection('ASSIGNED_DOCTOR_ONLY', 'ASSIGNED_DOCTOR_ONLY')).toBe(
      null
    );
    expect(confirmationForChartAccessChange(null)).toBeNull();
  });
});
