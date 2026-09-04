import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionInvoiceStatus, SubscriptionStatus } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  practiceFindMany: vi.fn(),
  invoiceFindMany: vi.fn(),
  invoiceFindFirst: vi.fn(),
  invoiceFindUnique: vi.fn(),
  invoiceCreate: vi.fn(),
  invoiceUpdate: vi.fn(),
  allocateNextInvoiceNumber: vi.fn(),
  lockPracticeRow: vi.fn(),
  logAudit: vi.fn(),
  sendSubscriptionInvoiceCreatedEmail: vi.fn(),
}));

vi.mock('../config/database', () => ({
  prisma: {
    practice: {
      findMany: (...args: unknown[]) => mocks.practiceFindMany(...args),
      findFirst: vi.fn(),
    },
    practiceSubscriptionInvoice: {
      findMany: (...args: unknown[]) => mocks.invoiceFindMany(...args),
      findFirst: (...args: unknown[]) => mocks.invoiceFindFirst(...args),
      findUnique: (...args: unknown[]) => mocks.invoiceFindUnique(...args),
      create: (...args: unknown[]) => mocks.invoiceCreate(...args),
      update: (...args: unknown[]) => mocks.invoiceUpdate(...args),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        practiceSubscriptionInvoice: {
          findFirst: (...args: unknown[]) => mocks.invoiceFindFirst(...args),
          create: (...args: unknown[]) => mocks.invoiceCreate(...args),
          update: (...args: unknown[]) => mocks.invoiceUpdate(...args),
        },
        $executeRaw: vi.fn(),
      }),
  },
}));

vi.mock('./auditService', () => ({
  logAudit: (...args: unknown[]) => mocks.logAudit(...args),
}));

vi.mock('./emailService', () => ({
  sendSubscriptionInvoiceCreatedEmail: (...args: unknown[]) =>
    mocks.sendSubscriptionInvoiceCreatedEmail(...args),
}));

vi.mock('./invoiceNumber', () => ({
  allocateNextInvoiceNumber: (...args: unknown[]) => mocks.allocateNextInvoiceNumber(...args),
}));

vi.mock('./seatService', () => ({
  lockPracticeRow: (...args: unknown[]) => mocks.lockPracticeRow(...args),
  getSeatUsage: vi.fn(),
}));

import { generateMonthlySubscriptionInvoices } from './subscriptionInvoiceService';

function persistedPractice(monthlyFeeCents: number) {
  return {
    id: 'prac-legacy',
    subdomain: 'legacy-solo',
    monthlyFeeCents,
    clinicName: 'Legacy Solo',
    trialEndsAt: new Date('2026-08-01T00:00:00.000Z'),
    subscriptionStatus: SubscriptionStatus.ACTIVE,
    ownerProfileId: 'owner-1',
    pilotProgramGrantedAt: null,
    pilotProgramStartsAt: null,
    pilotProgramEndsAt: null,
    owner: { email: 'owner@legacy.test', fullName: 'Legacy Owner' },
  };
}

describe('subscription invoice commercial amounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invoiceFindMany.mockResolvedValue([]);
    mocks.lockPracticeRow.mockResolvedValue(undefined);
    mocks.logAudit.mockResolvedValue(undefined);
    mocks.sendSubscriptionInvoiceCreatedEmail.mockResolvedValue(true);
    mocks.allocateNextInvoiceNumber.mockResolvedValue('MS-2026-00001');
  });

  it('creates invoices from persisted Practice.monthlyFeeCents, not catalogue defaults', async () => {
    const practice = persistedPractice(80_000);
    mocks.practiceFindMany.mockResolvedValue([practice]);
    mocks.invoiceFindFirst.mockResolvedValue(null);
    mocks.invoiceFindUnique.mockResolvedValue(null);
    mocks.invoiceCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'inv-new',
      invoiceNumber: 'MS-2026-00001',
      amountCents: data.amountCents,
      ...data,
    }));

    const now = new Date('2026-09-08T12:00:00.000Z');
    const result = await generateMonthlySubscriptionInvoices({
      practiceId: practice.id,
      now,
    });

    expect(result.createdCount).toBe(1);
    expect(mocks.invoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amountCents: 80_000,
          practiceId: practice.id,
        }),
      })
    );
    expect(mocks.invoiceCreate.mock.calls[0]?.[0]?.data?.amountCents).not.toBe(99_900);
  });

  it('does not rewrite historical invoice amounts when the period already exists', async () => {
    const practice = persistedPractice(99_900);
    const existing = {
      id: 'inv-historical',
      practiceId: practice.id,
      invoiceNumber: 'MS-2026-00001',
      periodStart: new Date('2026-08-01T00:00:00.000Z'),
      periodEnd: new Date('2026-08-31T00:00:00.000Z'),
      amountCents: 80_000,
      status: SubscriptionInvoiceStatus.PAID,
    };
    mocks.practiceFindMany.mockResolvedValue([practice]);
    mocks.invoiceFindFirst.mockResolvedValue(null);
    mocks.invoiceFindUnique.mockResolvedValue(existing);

    const result = await generateMonthlySubscriptionInvoices({
      practiceId: practice.id,
      now: new Date('2026-09-08T12:00:00.000Z'),
    });

    expect(result.createdCount).toBe(0);
    expect(mocks.invoiceCreate).not.toHaveBeenCalled();
    expect(mocks.invoiceUpdate).not.toHaveBeenCalled();
    expect(existing.amountCents).toBe(80_000);
    expect(existing.status).toBe(SubscriptionInvoiceStatus.PAID);
  });
});
