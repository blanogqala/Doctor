import { describe, expect, it, vi } from 'vitest';
import {
  SubscriptionInvoiceStatus,
  SubscriptionStatus,
  SubscriptionSuspensionReason,
} from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { applyRequestedSubscriptionStatus } from './saasPracticeService';

const now = new Date('2026-09-20T12:00:00.000Z');

function tx(outstanding: boolean) {
  return {
    practiceSubscriptionInvoice: {
      findFirst: vi.fn().mockResolvedValue(outstanding ? { id: 'inv-1' } : null),
    },
  } as never;
}

const suspendedBilling = {
  id: 'p1',
  subscriptionStatus: SubscriptionStatus.SUSPENDED,
  subscriptionSuspensionReason: SubscriptionSuspensionReason.BILLING_OVERDUE,
  subscriptionSuspendedAt: now,
};

describe('applyRequestedSubscriptionStatus', () => {
  it('manual suspend sets MANUAL reason', async () => {
    const result = await applyRequestedSubscriptionStatus(
      tx(false),
      {
        id: 'p1',
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionSuspensionReason: null,
        subscriptionSuspendedAt: null,
      },
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
  });

  it('27-29. rejects reactivate while outstanding payment', async () => {
    await expect(
      applyRequestedSubscriptionStatus(tx(true), suspendedBilling, SubscriptionStatus.ACTIVE, now)
    ).rejects.toMatchObject({ code: 'OUTSTANDING_SUBSCRIPTION_PAYMENT', statusCode: 409 });
  });

  it('30. reactivates after payment is clear', async () => {
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

  it('32. cannot generic-reactivate CANCELLED', async () => {
    await expect(
      applyRequestedSubscriptionStatus(
        tx(false),
        {
          id: 'p1',
          subscriptionStatus: SubscriptionStatus.CANCELLED,
          subscriptionSuspensionReason: null,
          subscriptionSuspendedAt: null,
        },
        SubscriptionStatus.ACTIVE,
        now
      )
    ).rejects.toMatchObject({ code: 'PRACTICE_CANCELLED' });
  });

  void SubscriptionInvoiceStatus;
  void AppError;
});
