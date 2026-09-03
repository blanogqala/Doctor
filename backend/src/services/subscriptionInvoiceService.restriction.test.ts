import { describe, expect, it, vi } from 'vitest';
import {
  SubscriptionStatus,
  SubscriptionSuspensionReason,
} from '@prisma/client';
import { applyBillingOverdueRestriction } from './subscriptionInvoiceService';

const now = new Date('2026-09-20T12:00:00.000Z');

function txWithUpdate(updated: Record<string, unknown>) {
  return {
    practice: {
      update: vi.fn().mockResolvedValue(updated),
    },
  } as never;
}

describe('applyBillingOverdueRestriction', () => {
  it('17. ACTIVE → SUSPENDED BILLING_OVERDUE', async () => {
    const updated = {
      id: 'p1',
      subscriptionStatus: SubscriptionStatus.SUSPENDED,
      subscriptionSuspensionReason: SubscriptionSuspensionReason.BILLING_OVERDUE,
      subscriptionSuspendedAt: now,
    };
    const tx = txWithUpdate(updated);
    const result = await applyBillingOverdueRestriction(
      tx,
      {
        id: 'p1',
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionSuspensionReason: null,
        subscriptionSuspendedAt: null,
      },
      now
    );
    expect(result.applied).toBe(true);
    expect(result.practice.subscriptionSuspensionReason).toBe(
      SubscriptionSuspensionReason.BILLING_OVERDUE
    );
  });

  it('18. already BILLING_OVERDUE is idempotent', async () => {
    const tx = txWithUpdate({});
    const result = await applyBillingOverdueRestriction(
      tx,
      {
        id: 'p1',
        subscriptionStatus: SubscriptionStatus.SUSPENDED,
        subscriptionSuspensionReason: SubscriptionSuspensionReason.BILLING_OVERDUE,
        subscriptionSuspendedAt: now,
      },
      now
    );
    expect(result.applied).toBe(false);
    expect(tx.practice.update).not.toHaveBeenCalled();
  });

  it('19. does not overwrite MANUAL suspension', async () => {
    const tx = txWithUpdate({});
    const result = await applyBillingOverdueRestriction(
      tx,
      {
        id: 'p1',
        subscriptionStatus: SubscriptionStatus.SUSPENDED,
        subscriptionSuspensionReason: SubscriptionSuspensionReason.MANUAL,
        subscriptionSuspendedAt: now,
      },
      now
    );
    expect(result.applied).toBe(false);
    expect(tx.practice.update).not.toHaveBeenCalled();
  });

  it('20. does not alter CANCELLED', async () => {
    const tx = txWithUpdate({});
    const result = await applyBillingOverdueRestriction(
      tx,
      {
        id: 'p1',
        subscriptionStatus: SubscriptionStatus.CANCELLED,
        subscriptionSuspensionReason: null,
        subscriptionSuspendedAt: null,
      },
      now
    );
    expect(result.applied).toBe(false);
    expect(tx.practice.update).not.toHaveBeenCalled();
  });

  it('legacy SUSPENDED/null reason is not overwritten', async () => {
    const tx = txWithUpdate({});
    const result = await applyBillingOverdueRestriction(
      tx,
      {
        id: 'p1',
        subscriptionStatus: SubscriptionStatus.SUSPENDED,
        subscriptionSuspensionReason: null,
        subscriptionSuspendedAt: null,
      },
      now
    );
    expect(result.applied).toBe(false);
  });
});
