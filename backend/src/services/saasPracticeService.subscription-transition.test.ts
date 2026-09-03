import { describe, expect, it, vi } from 'vitest';
import {
  SubscriptionStatus,
  SubscriptionSuspensionReason,
} from '@prisma/client';
import { applyRequestedSubscriptionStatus } from './saasPracticeService';

const now = new Date('2026-09-20T12:00:00.000Z');

function tx(outstanding: boolean) {
  return {
    practiceSubscriptionInvoice: {
      findFirst: vi.fn().mockResolvedValue(outstanding ? { id: 'inv-1' } : null),
    },
  } as never;
}

function practice(
  status: SubscriptionStatus,
  reason: SubscriptionSuspensionReason | null = null,
  suspendedAt: Date | null = null
) {
  return {
    id: 'p1',
    subscriptionStatus: status,
    subscriptionSuspensionReason: reason,
    subscriptionSuspendedAt: suspendedAt,
  };
}

const suspendedBilling = practice(
  SubscriptionStatus.SUSPENDED,
  SubscriptionSuspensionReason.BILLING_OVERDUE,
  now
);
const suspendedManual = practice(
  SubscriptionStatus.SUSPENDED,
  SubscriptionSuspensionReason.MANUAL,
  now
);
const cancelled = practice(SubscriptionStatus.CANCELLED);
const active = practice(SubscriptionStatus.ACTIVE);
const trial = practice(SubscriptionStatus.TRIAL);

describe('applyRequestedSubscriptionStatus', () => {
  it('manual suspend sets MANUAL reason', async () => {
    const result = await applyRequestedSubscriptionStatus(
      tx(false),
      active,
      SubscriptionStatus.SUSPENDED,
      now
    );
    expect(result.statusAuditAction).toBe('PRACTICE_SUSPENDED');
    expect(result.statusData).toMatchObject({
      subscriptionStatus: SubscriptionStatus.SUSPENDED,
      subscriptionSuspensionReason: SubscriptionSuspensionReason.MANUAL,
      subscriptionSuspendedAt: now,
    });
  });

  it('TRIAL -> SUSPENDED is MANUAL suspension', async () => {
    const result = await applyRequestedSubscriptionStatus(
      tx(false),
      trial,
      SubscriptionStatus.SUSPENDED,
      now
    );
    expect(result.statusAuditAction).toBe('PRACTICE_SUSPENDED');
    expect(result.statusData).toMatchObject({
      subscriptionStatus: SubscriptionStatus.SUSPENDED,
      subscriptionSuspensionReason: SubscriptionSuspensionReason.MANUAL,
    });
  });

  it('does not convert BILLING_OVERDUE to MANUAL', async () => {
    const result = await applyRequestedSubscriptionStatus(
      tx(false),
      suspendedBilling,
      SubscriptionStatus.SUSPENDED,
      now
    );
    expect(result.statusAuditAction).toBeNull();
    expect(result.statusData).toEqual({});
    expect(result.previousReason).toBe(SubscriptionSuspensionReason.BILLING_OVERDUE);
  });

  it('same-state transitions remain idempotent', async () => {
    for (const row of [active, trial, cancelled, suspendedBilling, suspendedManual]) {
      const result = await applyRequestedSubscriptionStatus(
        tx(false),
        row,
        row.subscriptionStatus,
        now
      );
      expect(result.statusData).toEqual({});
      expect(result.statusAuditAction).toBeNull();
      expect(result.previousReason).toBe(row.subscriptionSuspensionReason);
    }
  });

  it('rejects BILLING_OVERDUE SUSPENDED -> TRIAL', async () => {
    await expect(
      applyRequestedSubscriptionStatus(tx(false), suspendedBilling, SubscriptionStatus.TRIAL, now)
    ).rejects.toMatchObject({ code: 'INVALID_SUBSCRIPTION_TRANSITION', statusCode: 409 });
  });

  it('rejects MANUAL SUSPENDED -> TRIAL', async () => {
    await expect(
      applyRequestedSubscriptionStatus(tx(false), suspendedManual, SubscriptionStatus.TRIAL, now)
    ).rejects.toMatchObject({ code: 'INVALID_SUBSCRIPTION_TRANSITION', statusCode: 409 });
  });

  it('rejects CANCELLED -> TRIAL', async () => {
    await expect(
      applyRequestedSubscriptionStatus(tx(false), cancelled, SubscriptionStatus.TRIAL, now)
    ).rejects.toMatchObject({ code: 'PRACTICE_CANCELLED', statusCode: 409 });
  });

  it('rejects CANCELLED -> SUSPENDED', async () => {
    await expect(
      applyRequestedSubscriptionStatus(tx(false), cancelled, SubscriptionStatus.SUSPENDED, now)
    ).rejects.toMatchObject({ code: 'PRACTICE_CANCELLED', statusCode: 409 });
  });

  it('32. cannot generic-reactivate CANCELLED', async () => {
    await expect(
      applyRequestedSubscriptionStatus(tx(false), cancelled, SubscriptionStatus.ACTIVE, now)
    ).rejects.toMatchObject({ code: 'PRACTICE_CANCELLED' });
  });

  it('rejects ACTIVE -> TRIAL', async () => {
    await expect(
      applyRequestedSubscriptionStatus(tx(false), active, SubscriptionStatus.TRIAL, now)
    ).rejects.toMatchObject({ code: 'INVALID_SUBSCRIPTION_TRANSITION', statusCode: 409 });
  });

  it('27-29. rejects reactivate while outstanding payment', async () => {
    await expect(
      applyRequestedSubscriptionStatus(tx(true), suspendedBilling, SubscriptionStatus.ACTIVE, now)
    ).rejects.toMatchObject({ code: 'OUTSTANDING_SUBSCRIPTION_PAYMENT', statusCode: 409 });
  });

  it('30. reactivates after payment is clear and clears reason/time', async () => {
    const result = await applyRequestedSubscriptionStatus(
      tx(false),
      suspendedBilling,
      SubscriptionStatus.ACTIVE,
      now
    );
    expect(result.statusAuditAction).toBe('PRACTICE_REACTIVATED');
    expect(result.statusData).toMatchObject({
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      subscriptionSuspensionReason: null,
      subscriptionSuspendedAt: null,
    });
  });

  it('TRIAL -> ACTIVE activates and clears any stale suspension fields', async () => {
    const result = await applyRequestedSubscriptionStatus(
      tx(false),
      trial,
      SubscriptionStatus.ACTIVE,
      now
    );
    expect(result.statusAuditAction).toBeNull();
    expect(result.statusData).toMatchObject({
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      subscriptionSuspensionReason: null,
      subscriptionSuspendedAt: null,
    });
  });
});
