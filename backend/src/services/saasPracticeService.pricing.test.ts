import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  practiceCreate: vi.fn(),
  practiceFindFirst: vi.fn(),
  profileFindUnique: vi.fn(),
  invitationFindFirst: vi.fn(),
  invitationCreate: vi.fn(),
  lockPracticeRow: vi.fn(),
  assertDoctorSeatAvailable: vi.fn(),
  logAudit: vi.fn(),
  sendPracticeInvitationEmail: vi.fn(),
}));

vi.mock('../config/database', () => ({
  prisma: {
    practice: {
      findUnique: (...args: unknown[]) => mocks.findUnique(...args),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        practice: {
          create: (...args: unknown[]) => mocks.practiceCreate(...args),
          findFirst: (...args: unknown[]) => mocks.practiceFindFirst(...args),
        },
        profile: {
          findUnique: (...args: unknown[]) => mocks.profileFindUnique(...args),
        },
        practiceInvitation: {
          findFirst: (...args: unknown[]) => mocks.invitationFindFirst(...args),
          create: (...args: unknown[]) => mocks.invitationCreate(...args),
        },
      }),
  },
}));

vi.mock('./auditService', () => ({
  logAudit: (...args: unknown[]) => mocks.logAudit(...args),
}));

vi.mock('./emailService', () => ({
  sendPracticeInvitationEmail: (...args: unknown[]) => mocks.sendPracticeInvitationEmail(...args),
}));

vi.mock('./seatService', () => ({
  lockPracticeRow: (...args: unknown[]) => mocks.lockPracticeRow(...args),
  getSeatUsage: vi.fn(),
  assertDoctorSeatAvailable: (...args: unknown[]) => mocks.assertDoctorSeatAvailable(...args),
}));

import { createPracticeWithOwnerInvite } from './saasPracticeService';

describe('createPracticeWithOwnerInvite commercial defaults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(null);
    mocks.lockPracticeRow.mockResolvedValue(undefined);
    mocks.assertDoctorSeatAvailable.mockResolvedValue(undefined);
    mocks.logAudit.mockResolvedValue(undefined);
    mocks.sendPracticeInvitationEmail.mockResolvedValue(true);
    mocks.profileFindUnique.mockResolvedValue(null);
    mocks.invitationFindFirst.mockResolvedValue(null);

    mocks.practiceCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'prac-new',
      ...data,
    }));
    mocks.practiceFindFirst.mockResolvedValue({
      id: 'prac-new',
      subscriptionStatus: SubscriptionStatus.TRIAL,
      softDeletedAt: null,
    });
    mocks.invitationCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'inv-1',
      acceptedAt: null,
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      invitedByProfileId: null,
      ...data,
    }));
  });

  async function onboard(plan: SubscriptionPlan) {
    return createPracticeWithOwnerInvite({
      clinicName: `${plan} Clinic`,
      subdomain: `demo-${plan.toLowerCase()}`,
      ownerFullName: 'Dr Owner',
      ownerEmail: `owner-${plan.toLowerCase()}@medinathi.test`,
      subscriptionPlan: plan,
      superAdminId: 'sa-1',
    });
  }

  it('onboarding SOLO persists 99_900', async () => {
    const result = await onboard(SubscriptionPlan.SOLO);
    expect(result.practice.monthlyFeeCents).toBe(99_900);
    expect(result.practice.doctorSeatLimit).toBe(1);
    expect(mocks.practiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscriptionPlan: SubscriptionPlan.SOLO,
          monthlyFeeCents: 99_900,
          doctorSeatLimit: 1,
        }),
      })
    );
  });

  it('onboarding SMALL_PRACTICE persists 249_900', async () => {
    const result = await onboard(SubscriptionPlan.SMALL_PRACTICE);
    expect(result.practice.monthlyFeeCents).toBe(249_900);
    expect(result.practice.doctorSeatLimit).toBe(3);
    expect(mocks.practiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscriptionPlan: SubscriptionPlan.SMALL_PRACTICE,
          monthlyFeeCents: 249_900,
          doctorSeatLimit: 3,
        }),
      })
    );
  });

  it('onboarding CLINIC persists 449_900', async () => {
    const result = await onboard(SubscriptionPlan.CLINIC);
    expect(result.practice.monthlyFeeCents).toBe(449_900);
    expect(result.practice.doctorSeatLimit).toBe(5);
    expect(mocks.practiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscriptionPlan: SubscriptionPlan.CLINIC,
          monthlyFeeCents: 449_900,
          doctorSeatLimit: 5,
        }),
      })
    );
  });

  it('does not require an explicit monthly fee for catalogue plans', async () => {
    await onboard(SubscriptionPlan.SOLO);
    const createArg = mocks.practiceCreate.mock.calls[0]?.[0] as {
      data: { monthlyFeeCents: number; trialEndsAt: Date };
    };
    expect(createArg.data.monthlyFeeCents).toBe(99_900);
    const trialMs = createArg.data.trialEndsAt.getTime() - Date.now();
    expect(trialMs).toBeGreaterThan(13 * 24 * 60 * 60 * 1000);
    expect(trialMs).toBeLessThan(15 * 24 * 60 * 60 * 1000);
  });
});
