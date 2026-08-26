import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';

/**
 * Allocate the next MS-{year}-{seq} invoice number under a transaction-scoped advisory lock.
 * Does not rewrite historical numbers. Callers must run inside prisma.$transaction.
 */
export async function allocateNextInvoiceNumber(
  tx: Prisma.TransactionClient,
  year: number
): Promise<string> {
  const prefix = `MS-${year}-`;
  // Two-int advisory lock: namespace + year (xact-scoped, released on commit/rollback).
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(${8_605_020}::integer, ${year}::integer)
  `;

  const latest = await tx.practiceSubscriptionInvoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  });
  const lastSeq = latest ? Number(latest.invoiceNumber.slice(prefix.length)) : 0;
  const seq = Number.isFinite(lastSeq) ? lastSeq + 1 : 1;
  return `${prefix}${String(seq).padStart(5, '0')}`;
}

/** Deterministic unit-test helper without DB — formats a sequence. */
export function formatInvoiceNumber(year: number, seq: number): string {
  return `MS-${year}-${String(seq).padStart(5, '0')}`;
}

/** Unique fallback suffix if a rare P2002 still races after lock (should be unused). */
export function emergencyInvoiceNumber(year: number): string {
  const suffix = randomBytes(3).toString('hex').toUpperCase();
  return `MS-${year}-X${suffix}`;
}
