import {
  Prisma,
  SubscriptionInvoiceStatus,
  SubscriptionPaymentMethod,
  SubscriptionStatus,
  SubscriptionSuspensionReason,
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
import { isPilotPendingActivation, type PilotProgramFields } from './pilotProgramService';
import { lockPracticeRow } from './seatService';

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
  practice: {
    trialEndsAt: Date | null;
    subscriptionStatus: SubscriptionStatus;
  } & Partial<PilotProgramFields>,
  now = new Date()
): boolean {
  if (isPilotPendingActivation({
    pilotProgramGrantedAt: practice.pilotProgramGrantedAt ?? null,
    pilotProgramStartsAt: practice.pilotProgramStartsAt ?? null,
    pilotProgramEndsAt: practice.pilotProgramEndsAt ?? null,
  })) {
    return false;
  }
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

type LockedPractice = {
  id: string;
  subscriptionStatus: SubscriptionStatus;
  subscriptionSuspensionReason: SubscriptionSuspensionReason | null;
  subscriptionSuspendedAt: Date | null;
};

export type BillingRestrictionChange = {
  applied: boolean;
  practice: LockedPractice;
};

/**
 * Apply BILLING_OVERDUE restriction if the Practice is eligible.
 * Does not overwrite MANUAL / legacy / CANCELLED state.
 */
export async function applyBillingOverdueRestriction(
  tx: Prisma.TransactionClient,
  practice: LockedPractice,
  now: Date
): Promise<BillingRestrictionChange> {
  if (practice.subscriptionStatus === SubscriptionStatus.CANCELLED) {
    return { applied: false, practice };
  }
  if (practice.subscriptionStatus === SubscriptionStatus.SUSPENDED) {
    if (practice.subscriptionSuspensionReason === SubscriptionSuspensionReason.BILLING_OVERDUE) {
      return { applied: false, practice };
    }
    return { applied: false, practice };
  }
  if (
    practice.subscriptionStatus !== SubscriptionStatus.ACTIVE &&
    practice.subscriptionStatus !== SubscriptionStatus.TRIAL
  ) {
    return { applied: false, practice };
  }

  const updated = await tx.practice.update({
    where: { id: practice.id },
    data: {
      subscriptionStatus: SubscriptionStatus.SUSPENDED,
      subscriptionSuspensionReason: SubscriptionSuspensionReason.BILLING_OVERDUE,
      subscriptionSuspendedAt: now,
    },
    select: {
      id: true,
      subscriptionStatus: true,
      subscriptionSuspensionReason: true,
      subscriptionSuspendedAt: true,
    },
  });
  return { applied: true, practice: updated };
}

async function logBillingAuditSafe(
  params: Parameters<typeof logAudit>[0],
  label: string
) {
  try {
    await logAudit(params);
  } catch (err) {
    console.error(`[billing] ${label} audit failed after committed state:`, err);
  }
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
      pilotProgramGrantedAt: true,
      pilotProgramStartsAt: true,
      pilotProgramEndsAt: true,
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
  now?: Date;
}) {
  const reference = params.paymentReference.trim();
  if (!reference) throw new AppError(400, 'Payment reference is required');
  const now = params.now ?? new Date();

  const result = await prisma.$transaction(async (tx) => {
    await lockPracticeRow(tx, params.practiceId);

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

    const practice = await tx.practice.findFirst({
      where: { id: params.practiceId },
      select: {
        id: true,
        subscriptionStatus: true,
        subscriptionSuspensionReason: true,
        subscriptionSuspendedAt: true,
      },
    });
    if (!practice) throw new AppError(404, 'Practice not found');

    if (current.status === SubscriptionInvoiceStatus.PAYMENT_REPORTED) {
      return {
        invoice: current,
        alreadyReported: true as const,
        restrictionApplied: false,
        practice,
      };
    }
    if (
      current.status !== SubscriptionInvoiceStatus.DUE &&
      current.status !== SubscriptionInvoiceStatus.OVERDUE
    ) {
      throw new AppError(409, 'Invoice cannot accept a payment report in its current state');
    }

    const isLate =
      current.status === SubscriptionInvoiceStatus.OVERDUE || current.dueAt.getTime() < now.getTime();

    const invoice = await tx.practiceSubscriptionInvoice.update({
      where: { id: current.id },
      data: {
        status: SubscriptionInvoiceStatus.PAYMENT_REPORTED,
        paymentReportedAt: now,
        paymentReference: reference,
        paymentMethod: SubscriptionPaymentMethod.EFT,
      },
    });

    let restrictionApplied = false;
    let nextPractice = practice;
    if (isLate) {
      const restriction = await applyBillingOverdueRestriction(tx, practice, now);
      restrictionApplied = restriction.applied;
      nextPractice = restriction.practice;
    }

    return {
      invoice,
      alreadyReported: false as const,
      restrictionApplied,
      practice: nextPractice,
    };
  });

  if (!result.alreadyReported) {
    await logBillingAuditSafe(
      {
        practiceId: params.practiceId,
        actorId: params.actorId,
        action: 'SUBSCRIPTION_PAYMENT_REPORTED',
        resource: 'SUBSCRIPTION_INVOICE',
        resourceId: result.invoice.id,
        newValue: { paymentReference: reference, status: result.invoice.status },
      },
      'SUBSCRIPTION_PAYMENT_REPORTED'
    );
  }
  if (result.restrictionApplied) {
    await logBillingAuditSafe(
      {
        practiceId: params.practiceId,
        actorId: params.actorId,
        action: 'PRACTICE_BILLING_RESTRICTED',
        resource: 'PRACTICE',
        resourceId: params.practiceId,
        newValue: {
          invoiceId: result.invoice.id,
          invoiceNumber: result.invoice.invoiceNumber,
          subscriptionSuspensionReason: SubscriptionSuspensionReason.BILLING_OVERDUE,
          suspendedAt: result.practice.subscriptionSuspendedAt?.toISOString() ?? now.toISOString(),
        },
      },
      'PRACTICE_BILLING_RESTRICTED'
    );
  }

  return result.invoice;
}

export async function verifySubscriptionPayment(params: {
  invoiceId: string;
  superAdminId: string;
}) {
  const result = await prisma.$transaction(async (tx) => {
    const preview = await tx.practiceSubscriptionInvoice.findUnique({
      where: { id: params.invoiceId },
      select: { practiceId: true },
    });
    if (!preview) throw new AppError(404, 'Invoice not found');

    await lockPracticeRow(tx, preview.practiceId);

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
        suspensionReason: current.practice.subscriptionSuspensionReason,
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
    // Do not clear subscriptionSuspensionReason / subscriptionSuspendedAt.
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
      suspensionReason: current.practice.subscriptionSuspensionReason,
    };
  });

  if (!result.alreadyPaid) {
    await logBillingAuditSafe(
      {
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
      },
      'SUBSCRIPTION_PAYMENT_VERIFIED'
    );
  }

  return {
    invoice: result.invoice,
    alreadyPaid: result.alreadyPaid,
    remainsSuspended: result.remainsSuspended,
    previousStatus: result.previousStatus,
    nextStatus: result.nextStatus,
    suspensionReason: result.suspensionReason,
  };
}

/**
 * Mark past-due DUE invoices as OVERDUE and persist BILLING_OVERDUE restriction.
 * Safety net: late PAYMENT_REPORTED invoices also receive restriction if missing.
 */
export async function refreshOverdueSubscriptionInvoices(options?: {
  practiceId?: string;
  now?: Date;
}): Promise<{ updatedCount: number; restrictedCount: number }> {
  const now = options?.now ?? new Date();
  const practiceFilter = options?.practiceId ? { practiceId: options.practiceId } : {};

  const candidates = await prisma.practiceSubscriptionInvoice.findMany({
    where: {
      ...practiceFilter,
      OR: [
        { status: SubscriptionInvoiceStatus.DUE, dueAt: { lt: now } },
        { status: SubscriptionInvoiceStatus.OVERDUE },
        { status: SubscriptionInvoiceStatus.PAYMENT_REPORTED, dueAt: { lt: now } },
      ],
    },
    select: {
      id: true,
      practiceId: true,
      status: true,
      dueAt: true,
      paymentReportedAt: true,
    },
  });

  let updatedCount = 0;
  let restrictedCount = 0;

  for (const candidate of candidates) {
    const outcome = await prisma.$transaction(async (tx) => {
      await lockPracticeRow(tx, candidate.practiceId);

      const invoice = await tx.practiceSubscriptionInvoice.findFirst({
        where: { id: candidate.id, practiceId: candidate.practiceId },
      });
      if (!invoice) {
        return { invoiceOverdue: false, restrictionApplied: false, invoice: null, practice: null };
      }

      const practice = await tx.practice.findFirst({
        where: { id: candidate.practiceId },
        select: {
          id: true,
          subscriptionStatus: true,
          subscriptionSuspensionReason: true,
          subscriptionSuspendedAt: true,
        },
      });
      if (!practice) {
        return { invoiceOverdue: false, restrictionApplied: false, invoice: null, practice: null };
      }

      let working = invoice;
      let invoiceOverdue = false;
      if (
        invoice.status === SubscriptionInvoiceStatus.DUE &&
        invoice.dueAt.getTime() < now.getTime()
      ) {
        working = await tx.practiceSubscriptionInvoice.update({
          where: { id: invoice.id },
          data: { status: SubscriptionInvoiceStatus.OVERDUE },
        });
        invoiceOverdue = true;
      }

      const lateReported =
        working.status === SubscriptionInvoiceStatus.PAYMENT_REPORTED &&
        working.paymentReportedAt != null &&
        working.paymentReportedAt.getTime() > working.dueAt.getTime();

      const shouldRestrict =
        invoiceOverdue || lateReported || working.status === SubscriptionInvoiceStatus.OVERDUE;

      let restrictionApplied = false;
      let nextPractice = practice;
      if (shouldRestrict) {
        const restriction = await applyBillingOverdueRestriction(tx, practice, now);
        restrictionApplied = restriction.applied;
        nextPractice = restriction.practice;
      }

      return {
        invoiceOverdue,
        restrictionApplied,
        invoice: working,
        practice: nextPractice,
        previousInvoiceStatus: invoice.status,
      };
    });

    if (outcome.invoiceOverdue) updatedCount += 1;
    if (outcome.restrictionApplied) restrictedCount += 1;

    if (outcome.invoiceOverdue && outcome.invoice) {
      await logBillingAuditSafe(
        {
          practiceId: outcome.invoice.practiceId,
          action: 'SUBSCRIPTION_INVOICE_OVERDUE',
          resource: 'SUBSCRIPTION_INVOICE',
          resourceId: outcome.invoice.id,
          oldValue: { previousStatus: outcome.previousInvoiceStatus },
          newValue: {
            invoiceId: outcome.invoice.id,
            invoiceNumber: outcome.invoice.invoiceNumber,
            dueAt: outcome.invoice.dueAt.toISOString(),
            previousStatus: outcome.previousInvoiceStatus,
            newStatus: outcome.invoice.status,
          },
        },
        'SUBSCRIPTION_INVOICE_OVERDUE'
      );
    }
    if (outcome.restrictionApplied && outcome.invoice && outcome.practice) {
      await logBillingAuditSafe(
        {
          practiceId: outcome.practice.id,
          action: 'PRACTICE_BILLING_RESTRICTED',
          resource: 'PRACTICE',
          resourceId: outcome.practice.id,
          newValue: {
            invoiceId: outcome.invoice.id,
            invoiceNumber: outcome.invoice.invoiceNumber,
            subscriptionSuspensionReason: SubscriptionSuspensionReason.BILLING_OVERDUE,
            suspendedAt: outcome.practice.subscriptionSuspendedAt?.toISOString() ?? now.toISOString(),
          },
        },
        'PRACTICE_BILLING_RESTRICTED'
      );
    }
  }

  return { updatedCount, restrictedCount };
}

/** @deprecated Prefer paidSubscriptionPeriodFromStart — kept for any residual callers. */
export function calendarMonthPeriod(at = new Date()): { periodStart: Date; periodEnd: Date } {
  const periodStart = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 0));
  return { periodStart, periodEnd };
}
