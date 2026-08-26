import { prisma } from '../config/database';
import { writeStructuredLog } from '../middleware/requestLogger';
import {
  generateMonthlySubscriptionInvoices,
  refreshOverdueSubscriptionInvoices,
} from '../services/subscriptionInvoiceService';

/** Daily billing tick (24h). One-instance Render is OK; multi-instance needs advisory lock later. */
const INTERVAL_MS = 24 * 60 * 60 * 1000;

/** PostgreSQL advisory lock key for billing job (arbitrary stable int). */
const BILLING_ADVISORY_LOCK_KEY = 860_501;

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

/**
 * Try session-level advisory lock. Returns true if this instance holds the lock.
 * Safe no-op on DBs that reject advisory locks (caller treats false as skip).
 */
async function tryBillingLock(): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_lock(${BILLING_ADVISORY_LOCK_KEY}::bigint) AS locked
    `;
    return Boolean(rows[0]?.locked);
  } catch {
    // If advisory locks unavailable, allow run (single-instance assumption).
    return true;
  }
}

async function releaseBillingLock(): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${BILLING_ADVISORY_LOCK_KEY}::bigint)`;
  } catch {
    // ignore
  }
}

export async function runBillingSchedulerJob(options?: { now?: Date }) {
  if (running) return;
  running = true;
  const locked = await tryBillingLock();
  if (!locked) {
    running = false;
    writeStructuredLog('info', 'billing_scheduler_skipped_lock');
    return;
  }

  try {
    const now = options?.now ?? new Date();
    const generated = await generateMonthlySubscriptionInvoices({ now });
    const overdue = await refreshOverdueSubscriptionInvoices({ now });
    writeStructuredLog('info', 'billing_scheduler_tick', {
      createdCount: generated.createdCount,
      skippedCount: generated.skippedCount,
      overdueUpdated: overdue.updatedCount,
    });
  } catch (err) {
    writeStructuredLog('error', 'billing_scheduler_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    await releaseBillingLock();
    running = false;
  }
}

export function startBillingSchedulerJob() {
  if (timer) return;
  void runBillingSchedulerJob();
  timer = setInterval(() => {
    void runBillingSchedulerJob();
  }, INTERVAL_MS);
  writeStructuredLog('info', 'billing_scheduler_started', {
    intervalMs: INTERVAL_MS,
    note: 'Single-instance OK; multi-instance uses pg_try_advisory_lock',
  });
}

export function stopBillingSchedulerJob() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
