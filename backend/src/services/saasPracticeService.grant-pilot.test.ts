import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionStatus } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { PILOT_PROGRAM_DURATION_MS } from './pilotProgramService';

const mocks = vi.hoisted(() => ({
  lockPracticeRow: vi.fn(),
  txFindFirst: vi.fn(),
  txUpdate: vi.fn(),
  logAudit: vi.fn(),
  callOrder: [] as string[],
}));

vi.mock('../config/database', () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        practice: {
          findFirst: (...args: unknown[]) => {
            mocks.callOrder.push('findFirst');
            return mocks.txFindFirst(...args);
          },
          update: (...args: unknown[]) => mocks.txUpdate(...args),
        },
      }),
  },
}));

vi.mock('./auditService', () => ({
  logAudit: (...args: unknown[]) => mocks.logAudit(...args),
}));

vi.mock('./seatService', () => ({
  lockPracticeRow: (...args: unknown[]) => {
    mocks.callOrder.push('lock');
    return mocks.lockPracticeRow(...args);
  },
  getSeatUsage: vi.fn(),
}));

import { grantPilotProgramAccess } from './saasPracticeService';

function trialPractice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prac-1',
    subdomain: 'pilot-clinic',
    clinicName: 'Pilot Clinic',
    subscriptionStatus: SubscriptionStatus.TRIAL,
    ownerProfileId: null,
    pilotProgramGrantedAt: null,
    pilotProgramStartsAt: null,
    pilotProgramEndsAt: null,
    trialEndsAt: new Date('2026-09-17T00:00:00.000Z'),
    softDeletedAt: null,
    ...overrides,
  };
}

describe('grantPilotProgramAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.callOrder = [];
    mocks.lockPracticeRow.mockResolvedValue(undefined);
    mocks.logAudit.mockResolvedValue(undefined);
  });

  it('1. re-reads Practice inside transaction after row lock', async () => {
    const practice = trialPractice();
    mocks.txFindFirst.mockResolvedValue(practice);
    mocks.txUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...practice,
      ...data,
    }));

    await grantPilotProgramAccess({
      practiceId: 'prac-1',
      superAdminId: 'sa-1',
    });

    expect(mocks.lockPracticeRow).toHaveBeenCalledWith(expect.anything(), 'prac-1');
    expect(mocks.txFindFirst).toHaveBeenCalledWith({
      where: { id: 'prac-1', softDeletedAt: null },
    });
    expect(mocks.callOrder).toEqual(['lock', 'findFirst']);
  });

  it('2. practice already activated when locked → immediate ACTIVE Pilot for exact 30 days', async () => {
    const practice = trialPractice({ ownerProfileId: 'owner-1' });
    mocks.txFindFirst.mockResolvedValue(practice);
    mocks.txUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...practice,
      ...data,
    }));

    const result = await grantPilotProgramAccess({
      practiceId: 'prac-1',
      superAdminId: 'sa-1',
    });

    const startsAt = result.practice.pilotProgramStartsAt as Date;
    const endsAt = result.practice.pilotProgramEndsAt as Date;
    expect(result.pilot_program.status).toBe('ACTIVE');
    expect(endsAt.getTime() - startsAt.getTime()).toBe(PILOT_PROGRAM_DURATION_MS);
    expect(result.practice.trialEndsAt?.getTime()).toBe(endsAt.getTime());
  });

  it('3. practice not activated when locked → PENDING_ACTIVATION', async () => {
    const practice = trialPractice();
    mocks.txFindFirst.mockResolvedValue(practice);
    mocks.txUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...practice,
      ...data,
    }));

    const result = await grantPilotProgramAccess({
      practiceId: 'prac-1',
      superAdminId: 'sa-1',
    });

    expect(result.pilot_program.status).toBe('PENDING_ACTIVATION');
    expect(result.practice.pilotProgramGrantedAt).toBeTruthy();
    expect(result.practice.pilotProgramStartsAt).toBeNull();
    expect(result.practice.pilotProgramEndsAt).toBeNull();
  });

  it('4. second grant after first committed → 409 and does not extend dates', async () => {
    const grantedAt = new Date('2026-09-01T00:00:00.000Z');
    const endsAt = new Date(grantedAt.getTime() + PILOT_PROGRAM_DURATION_MS);
    mocks.txFindFirst.mockResolvedValue(
      trialPractice({
        ownerProfileId: 'owner-1',
        pilotProgramGrantedAt: grantedAt,
        pilotProgramStartsAt: grantedAt,
        pilotProgramEndsAt: endsAt,
        trialEndsAt: endsAt,
      })
    );

    await expect(
      grantPilotProgramAccess({
        practiceId: 'prac-1',
        superAdminId: 'sa-1',
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'PILOT_ALREADY_GRANTED',
    });

    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it('rejects non-TRIAL subscription inside locked transaction', async () => {
    mocks.txFindFirst.mockResolvedValue(
      trialPractice({ subscriptionStatus: SubscriptionStatus.ACTIVE })
    );

    await expect(
      grantPilotProgramAccess({
        practiceId: 'prac-1',
        superAdminId: 'sa-1',
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'PILOT_INVALID_SUBSCRIPTION_STATUS',
    });
  });

  it('rejects missing practice inside locked transaction', async () => {
    mocks.txFindFirst.mockResolvedValue(null);

    await expect(
      grantPilotProgramAccess({
        practiceId: 'prac-1',
        superAdminId: 'sa-1',
      })
    ).rejects.toBeInstanceOf(AppError);
  });

  it('audits final committed state after transaction', async () => {
    const practice = trialPractice({ ownerProfileId: 'owner-1' });
    mocks.txFindFirst.mockResolvedValue(practice);
    mocks.txUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...practice,
      ...data,
    }));

    await grantPilotProgramAccess({
      practiceId: 'prac-1',
      superAdminId: 'sa-1',
    });

    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PILOT_ACCESS_GRANTED',
        newValue: expect.objectContaining({
          durationDays: 30,
          startsAt: expect.any(String),
          endsAt: expect.any(String),
        }),
      })
    );
  });
});
