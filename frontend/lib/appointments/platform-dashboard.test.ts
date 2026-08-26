import { describe, expect, it } from 'vitest';

/** Platform Admin must not surface clinical field names in dashboard copy/labels. */
const PLATFORM_DASHBOARD_SAFE_LABELS = [
  'Configured monthly revenue',
  'Total practices',
  'Doctors across platform',
  'Patients across platform',
  'Subscription distribution',
  'Practice overview',
];

const FORBIDDEN_CLINICAL = [
  'diagnosis',
  'prescription',
  'SOAP',
  'assessment',
  'clinical notes',
  'transcript',
];

describe('platform admin dashboard terminology', () => {
  it('uses configured revenue wording rather than collected settlement claims', () => {
    expect(PLATFORM_DASHBOARD_SAFE_LABELS.join(' ')).toMatch(/Configured monthly revenue/i);
    expect(PLATFORM_DASHBOARD_SAFE_LABELS.join(' ')).not.toMatch(/Collected revenue/i);
  });

  it('does not include clinical surveillance labels in platform copy set', () => {
    const blob = PLATFORM_DASHBOARD_SAFE_LABELS.join(' ').toLowerCase();
    for (const term of FORBIDDEN_CLINICAL) {
      expect(blob).not.toContain(term.toLowerCase());
    }
  });
});
