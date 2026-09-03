import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClinicalChartAccessMode } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  lockPracticeRow: vi.fn(),
  txFindFirst: vi.fn(),
  txUpdate: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('../config/database', () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        practice: {
          findFirst: (...args: unknown[]) => mocks.txFindFirst(...args),
          update: (...args: unknown[]) => mocks.txUpdate(...args),
        },
      }),
  },
}));

vi.mock('./auditService', () => ({
  logAudit: (...args: unknown[]) => mocks.logAudit(...args),
}));

vi.mock('./seatService', () => ({
  lockPracticeRow: (...args: unknown[]) => mocks.lockPracticeRow(...args),
  getSeatUsage: vi.fn(),
}));

import { updateClinicalChartAccessMode } from './saasPracticeService';

describe('updateClinicalChartAccessMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lockPracticeRow.mockResolvedValue(undefined);
    mocks.logAudit.mockResolvedValue(undefined);
  });

  it('updates mode and audits the change', async () => {
    const practice = {
      id: 'prac-1',
      clinicalChartAccessMode: ClinicalChartAccessMode.ASSIGNED_DOCTOR_ONLY,
      softDeletedAt: null,
    };
    mocks.txFindFirst.mockResolvedValue(practice);
    mocks.txUpdate.mockResolvedValue({
      ...practice,
      clinicalChartAccessMode: ClinicalChartAccessMode.ALL_ACTIVE_DOCTORS,
    });

    const result = await updateClinicalChartAccessMode({
      practiceId: 'prac-1',
      mode: ClinicalChartAccessMode.ALL_ACTIVE_DOCTORS,
      superAdminId: 'sa-1',
    });

    expect(result).toEqual({
      practiceId: 'prac-1',
      clinicalChartAccessMode: ClinicalChartAccessMode.ALL_ACTIVE_DOCTORS,
      changed: true,
    });
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CLINICAL_CHART_ACCESS_MODE_CHANGED',
        resource: 'PRACTICE',
        actorSuperAdminId: 'sa-1',
        oldValue: { clinicalChartAccessMode: ClinicalChartAccessMode.ASSIGNED_DOCTOR_ONLY },
        newValue: { clinicalChartAccessMode: ClinicalChartAccessMode.ALL_ACTIVE_DOCTORS },
      })
    );
  });

  it('same-mode update is idempotent with no audit', async () => {
    const practice = {
      id: 'prac-1',
      clinicalChartAccessMode: ClinicalChartAccessMode.ASSIGNED_DOCTOR_ONLY,
      softDeletedAt: null,
    };
    mocks.txFindFirst.mockResolvedValue(practice);

    const result = await updateClinicalChartAccessMode({
      practiceId: 'prac-1',
      mode: ClinicalChartAccessMode.ASSIGNED_DOCTOR_ONLY,
      superAdminId: 'sa-1',
    });

    expect(result.changed).toBe(false);
    expect(mocks.txUpdate).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('missing Practice is 404', async () => {
    mocks.txFindFirst.mockResolvedValue(null);
    await expect(
      updateClinicalChartAccessMode({
        practiceId: 'missing',
        mode: ClinicalChartAccessMode.ALL_ACTIVE_DOCTORS,
        superAdminId: 'sa-1',
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
