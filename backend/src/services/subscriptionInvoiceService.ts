import {
  Prisma,
  SubscriptionInvoiceStatus,
  SubscriptionPaymentMethod,
  SubscriptionStatus,
} from '@prisma/client';
import { prisma } from '../config/database';
import { ownerBillingUrl } from '../config/eftPayment';
import {
  getSubscriptionInvoiceDueDays,
  SUBSCRIPTION_INVOICE_BUSINESS_TIMEZONE,
} from '../config/subscriptionInvoiceTerms';
import { AppError } from '../middleware/errorHandler';
import { logAudit } from './auditService';
import { sendSubscriptionInvoiceCreatedEmail } from './emailService';
import { allocateNextInvoiceNumber } from './invoiceNumber';

/** UTC calendar date at 00:00:00.000Z for the given Y-M-D parts. */
function utcDateOnly(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day));
}

function toUtcDateParts(d: Date): { y: number; m: number; day: number } {
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth(),
    day: d.getUTCDate(),
  };
}

/**
 * One paid subscription period starting at periodStart (inclusive date).
 * Ends the day before periodStart + 1 calendar month (non-overlapping).
 * Example: 8 Sep → 7 Oct; next period starts 8 Oct.
 */
export function paidSubscriptionPeriodFromStart(periodStart: Date): {
  periodStart: Date;
  periodEnd: Date;
} {
  const { y, m, day } = toUtcDateParts(periodStart);
  const start = utcDateOnly(y, m, day);
  // Next period start = same calendar day next month (JS Date handles month overflow)
  const nextStart = utcDateOnly(y, m + 1, day);
  // periodEnd = day before next start
  const periodEnd = new Date(nextStart.getTime() - 24 * 60 * 60 * 1000);
  return { periodStart: start, periodEnd };
}

/**
 * dueAt = end of (periodStart + dueDays) in Africa/Johannesburg,
 * so an invoice "Due 15 Sep" is not OVERDUE at the start of 15 Sep.
 */
export function computeSubscriptionInvoiceDueAt(
  periodStart: Date,
  dueDays = getSubscriptionInvoiceDueDays()
): Date {
  const { y, m, day } = toUtcDateParts(periodStart);
  const dueDate = utcDateOnly(y, m, day + dueDays);

  // End of due calendar day in Africa/Johannesburg (UTC+2, no DST).
  // Represent as 21:59:59.999Z = 23:59:59.999 SAST on that calendar date.
  // Using fixed offset keeps tests deterministic without depending on ICU tz data.
  void SUBSCRIPTION_INVOICE_BUSINESS_TIMEZONE;
  return new Date(
    Date.UTC(
      dueDate.getUTCFullYear(),
      dueDate.getUTCMonth(),
      dueDate.getUTCDate(),
      21,
      59,
      59,
      999
    )
  );
}

export function isPracticeInvoiceEligible(
  practice: { trialEndsAt: Date | null; subscriptionStatus: SubscriptionStatus },
  now = new Date()
): boolean {
  if (
    practice.subscriptionStatus !== SubscriptionStatus.TRIAL &&
    practice.subscriptionStatus !== SubscriptionStatus.ACTIVE &&
    practice.subscriptionStatus !== SubscriptionStatus.SUSPENDED
  ) {
    return false;
  }
  if (!practice.trialEndsAt) return true;
  return now.getTime() >= practice.trialEndsAt.getTime();
}

/**
 * Resolve the next non-overlapping paid period for a Practice.
 * Returns null when still inside free trial or no period is due yet.
 */
export async function resolveNextPaidPeriod(
  client: Prisma.TransactionClient | typeof prisma,
  practice: { id: string; trialEndsAt: Date | null },
  now = new Date()
): Promise<{ periodStart: Date; periodEnd: Date } | null> {
  if (practice.trialEndsAt && now.getTime() < practice.trialEndsAt.getTime()) {
    return null;
  }

  const latest = await client.practiceSubscriptionInvoice.findFirst({
    where: {
      practiceId: practice.id,
      status: { not: SubscriptionInvoiceStatus.VOID },
    },
    orderBy: [{ periodEnd: 'desc' }, { periodStart: 'desc' }],
    select: { periodStart: true, periodEnd: true },
  });

  if (!latest) {
    if (!practice.trialEndsAt) {
      // No trial anchor — start a period at "now" date (UTC date)
      const { y, m, day } = toUtcDateParts(now);
      return paidSubscriptionPeriodFromStart(utcDateOnly(y, m, day));
    }
    return paidSubscriptionPeriodFromStart(practice.trialEndsAt);
  }

  // Next period starts the calendar day after latest.periodEnd
  const { y, m, day } = toUtcDateParts(latest.periodEnd);
  const nextStart = utcDateOnly(y, m, day + 1);
  if (now.getTime() < nextStart.getTime()) {
    // Current paid period still covers "now" — do not create the next invoice early
    // unless we are at/after nextStart. Generator runs monthly; allow create when now >= nextStart.
    return null;
  }
  return paidSubscriptionPeriodFromStart(nextStart);
}

async function nextInvoiceNumber(tx: Prisma.TransactionClient, year: number): Promise<string> {
  return allocateNextInvoiceNumber(tx, year);
}

export async function generateMonthlySubscriptionInvoices(options?: {
  practiceId?: string;
  now?: Date;
}) {
  const now = options?.now ?? new Date();

  const practices = await prisma.practice.findMany({
    where: {
      softDeletedAt: null,
      subscriptionStatus: {
        in: [SubscriptionStatus.TRIAL, SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED],
      },
      ...(options?.practiceId ? { id: options.practiceId } : {}),
    },
    select: {
      id: true,
      subdomain: true,
      monthlyFeeCents: true,
      clinicName: true,
      trialEndsAt: true,
      subscriptionStatus: true,
      ownerProfileId: true,
      owner: { select: { email: true, fullName: true } },
    },
  });

  const created: string[] = [];
  const skipped: string[] = [];

  await refreshOverdueSubscriptionInvoices(
    options?.practiceId ? { practiceId: options.practiceId, now } : { now }
  );

  for (const practice of practices) {
    if (!isPracticeInvoiceEligible(practice, now)) {
      skipped.push(practice.id);
      continue;
    }

    const period = await resolveNextPaidPeriod(prisma, practice, now);
    if (!period) {
      skipped.push(practice.id);
      continue;
    }

    const { periodStart, periodEnd } = period;

    const existing = await prisma.practiceSubscriptionInvoice.findUnique({
      where: {
        practiceId_periodStart_periodEnd: {
          practiceId: practice.id,
          periodStart,
          periodEnd,
        },
      },
    });
    if (existing) {
      skipped.push(practice.id);
      continue;
    }

    try {
      const dueAt = computeSubscriptionInvoiceDueAt(periodStart);
      let invoice: Awaited<ReturnType<typeof prisma.practiceSubscriptionInvoice.create>> | null =
        null;
      let periodConflict = false;
      let lastErr: unknown;
      // Retry only on invoiceNumber uniqueness races; period uniqueness → skip (idempotent).
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          invoice = await prisma.$transaction(async (tx) => {
            const year = periodStart.getUTCFullYear();
            const invoiceNumber = await nextInvoiceNumber(tx, year);
            return tx.practiceSubscriptionInvoice.create({
              data: {
                practiceId: practice.id,
                invoiceNumber,
                periodStart,
                periodEnd,
                amountCents: practice.monthlyFeeCents,
                status: SubscriptionInvoiceStatus.DUE,
                dueAt,
              },
            });
          });
          break;
        } catch (err) {
          lastErr = err;
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === 'P2002'
          ) {
            const targets = (err.meta?.target as string[] | string | undefined) ?? [];
            const targetStr = Array.isArray(targets) ? targets.join(',') : String(targets);
            if (
              targetStr.includes('period') ||
              targetStr.includes('practiceId_periodStart_periodEnd')
            ) {
              periodConflict = true;
              break;
            }
            // invoice_number collision — retry with next sequence under lock
            continue;
          }
          throw err;
        }
      }
      if (periodConflict || !invoice) {
        if (!invoice && lastErr && !periodConflict) throw lastErr;
        skipped.push(practice.id);
        continue;
      }
      created.push(invoice.id);
      await logAudit({
        practiceId: practice.id,
        action: 'SUBSCRIPTION_INVOICE_CREATED',
        resource: 'SUBSCRIPTION_INVOICE',
        resourceId: invoice.id,
        newValue: {
          invoiceNumber: invoice.invoiceNumber,
          amountCents: invoice.amountCents,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        },
      });

      // Email only for newly created invoices (not scheduler re-runs that skip existing).
      if (practice.owner?.email) {
        try {
          await sendSubscriptionInvoiceCreatedEmail({
            email: practice.owner.email,
            fullName: practice.owner.fullName,
            practiceName: practice.clinicName,
            invoiceNumber: invoice.invoiceNumber,
            amountCents: invoice.amountCents,
            dueAt: invoice.dueAt,
            billingUrl: ownerBillingUrl(practice.subdomain),
          });
        } catch (err) {
          console.error('[billing] Invoice created email failed:', err);
        }
      }
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        skipped.push(practice.id);
        continue;
      }
      throw err;
    }
  }

  return {
    createdCount: created.length,
    skippedCount: skipped.length,
    createdIds: created,
  };
}

export async function reportEftPayment(params: {
  practiceId: string;
  invoiceId: string;
  actorId: string;
  paymentReference: string;
}) {
  const reference = params.paymentReference.trim();
  if (!reference) throw new AppError(400, 'Payment reference is required');

  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.practiceSubscriptionInvoice.findFirst({
      where: { id: params.invoiceId, practiceId: params.practiceId },
    });
    if (!current) throw new AppError(404, 'Invoice not found');
    if (current.status === SubscriptionInvoiceStatus.PAID) {
      throw new AppError(409, 'Invoice is already paid');
    }
    if (current.status === SubscriptionInvoiceStatus.VOID) {
      throw new AppError(409, 'Invoice has been voided');
    }
    if (current.status === SubscriptionInvoiceStatus.PAYMENT_REPORTED) {
      return { invoice: current, alreadyReported: true as const };
    }
    if (
      current.status !== SubscriptionInvoiceStatus.DUE &&
      current.status !== SubscriptionInvoiceStatus.OVERDUE
    ) {
      throw new AppError(409, 'Invoice cannot accept a payment report in its current state');
    }

    const invoice = await tx.practiceSubscriptionInvoice.update({
      where: { id: current.id },
      data: {
        status: SubscriptionInvoiceStatus.PAYMENT_REPORTED,
        paymentReportedAt: new Date(),
        paymentReference: reference,
        paymentMethod: SubscriptionPaymentMethod.EFT,
      },
    });
    return { invoice, alreadyReported: false as const };
  });

  if (!result.alreadyReported) {
    await logAudit({
      practiceId: params.practiceId,
      actorId: params.actorId,
      action: 'SUBSCRIPTION_PAYMENT_REPORTED',
      resource: 'SUBSCRIPTION_INVOICE',
      resourceId: result.invoice.id,
      newValue: { paymentReference: reference, status: result.invoice.status },
    });
  }

  return result.invoice;
}

export async function verifySubscriptionPayment(params: {
  invoiceId: string;
  superAdminId: string;
}) {
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.practiceSubscriptionInvoice.findUnique({
      where: { id: params.invoiceId },
      include: { practice: true },
    });
    if (!current) throw new AppError(404, 'Invoice not found');
    if (current.status === SubscriptionInvoiceStatus.PAID) {
      return {
        invoice: current,
        alreadyPaid: true as const,
        previousStatus: current.practice.subscriptionStatus,
        nextStatus: current.practice.subscriptionStatus,
        remainsSuspended: current.practice.subscriptionStatus === SubscriptionStatus.SUSPENDED,
      };
    }
    if (current.status !== SubscriptionInvoiceStatus.PAYMENT_REPORTED) {
      throw new AppError(409, 'Only reported payments can be verified');
    }

    const invoice = await tx.practiceSubscriptionInvoice.update({
      where: { id: current.id },
      data: {
        status: SubscriptionInvoiceStatus.PAID,
        paidAt: new Date(),
        verifiedBySuperAdminId: params.superAdminId,
      },
      include: { practice: true },
    });

    // Payment verification activates TRIAL → ACTIVE only.
    // SUSPENDED Practices remain SUSPENDED — Super Admin must explicitly reactivate.
    let nextStatus = current.practice.subscriptionStatus;
    if (current.practice.subscriptionStatus === SubscriptionStatus.TRIAL) {
      nextStatus = SubscriptionStatus.ACTIVE;
    }

    if (nextStatus !== current.practice.subscriptionStatus) {
      await tx.practice.update({
        where: { id: current.practiceId },
        data: { subscriptionStatus: nextStatus },
      });
    }

    return {
      invoice: { ...invoice, practice: { ...invoice.practice, subscriptionStatus: nextStatus } },
      alreadyPaid: false as const,
      previousStatus: current.practice.subscriptionStatus,
      nextStatus,
      remainsSuspended: current.practice.subscriptionStatus === SubscriptionStatus.SUSPENDED,
    };
  });

  if (!result.alreadyPaid) {
    await logAudit({
      practiceId: result.invoice.practiceId,
      actorSuperAdminId: params.superAdminId,
      action: 'SUBSCRIPTION_PAYMENT_VERIFIED',
      resource: 'SUBSCRIPTION_INVOICE',
      resourceId: result.invoice.id,
      oldValue: { subscriptionStatus: result.previousStatus },
      newValue: {
        status: SubscriptionInvoiceStatus.PAID,
        subscriptionStatus: result.nextStatus,
        remainsSuspended: result.remainsSuspended,
      },
    });
  }

  return {
    invoice: result.invoice,
    alreadyPaid: result.alreadyPaid,
    remainsSuspended: result.remainsSuspended,
    previousStatus: result.previousStatus,
    nextStatus: result.nextStatus,
  };
}

/**
 * Idempotent: mark past-due DUE invoices as OVERDUE.
 * Does not touch PAYMENT_REPORTED, PAID, or VOID.
 * overdue when now > dueAt (dueAt is end-of-due-day SAST).
 */
export async function refreshOverdueSubscriptionInvoices(options?: {
  practiceId?: string;
  now?: Date;
}): Promise<{ updatedCount: number }> {
  const now = options?.now ?? new Date();
  const result = await prisma.practiceSubscriptionInvoice.updateMany({
    where: {
      status: SubscriptionInvoiceStatus.DUE,
      dueAt: { lt: now },
      ...(options?.practiceId ? { practiceId: options.practiceId } : {}),
    },
    data: { status: SubscriptionInvoiceStatus.OVERDUE },
  });
  return { updatedCount: result.count };
}

/** @deprecated Prefer paidSubscriptionPeriodFromStart — kept for any residual callers. */
export function calendarMonthPeriod(at = new Date()): { periodStart: Date; periodEnd: Date } {
  const periodStart = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 0));
  return { periodStart, periodEnd };
}
