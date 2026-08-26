import { AppointmentStatus } from '@prisma/client';
import { prisma } from '../config/database';
import {
  ACTIVE_BOOKING_STATUSES,
  notifyAppointmentNoShow,
  notifyAppointmentReminder,
} from '../services/messageService';
import { writeStructuredLog } from '../middleware/requestLogger';

const INTERVAL_MS = 60_000;
const REMINDER_WINDOW_MS = 30 * 60_000;
const LIFECYCLE_ADVISORY_LOCK_KEY = 860_502;

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function tryLifecycleLock(): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_lock(${LIFECYCLE_ADVISORY_LOCK_KEY}::bigint) AS locked
    `;
    return Boolean(rows[0]?.locked);
  } catch {
    return true;
  }
}

async function releaseLifecycleLock(): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${LIFECYCLE_ADVISORY_LOCK_KEY}::bigint)`;
  } catch {
    // ignore
  }
}

/**
 * Claim reminder slot, deliver, roll back claim on failure so retries stay safe.
 * Never leaves reminderSentAt set when delivery did not succeed.
 */
async function processReminders(now: Date) {
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_MS);

  const due = await prisma.appointment.findMany({
    where: {
      softDeletedAt: null,
      reminderSentAt: null,
      status: { in: ACTIVE_BOOKING_STATUSES },
      scheduledAt: {
        gt: now,
        lte: windowEnd,
      },
    },
    select: { id: true },
  });

  for (const appt of due) {
    try {
      const claimed = await prisma.appointment.updateMany({
        where: { id: appt.id, reminderSentAt: null },
        data: { reminderSentAt: now },
      });
      if (claimed.count === 0) continue;

      try {
        await notifyAppointmentReminder(appt.id);
      } catch (err) {
        await prisma.appointment.update({
          where: { id: appt.id },
          data: { reminderSentAt: null },
        });
        throw err;
      }
    } catch (err) {
      console.error(`[appointmentLifecycle] reminder failed for ${appt.id}:`, err);
    }
  }
}

async function processNoShows(now: Date) {
  const expired = await prisma.appointment.findMany({
    where: {
      softDeletedAt: null,
      status: { in: ACTIVE_BOOKING_STATUSES },
      scheduledAt: { lte: now },
    },
    select: { id: true },
  });

  for (const appt of expired) {
    try {
      const updated = await prisma.appointment.updateMany({
        where: {
          id: appt.id,
          status: { in: ACTIVE_BOOKING_STATUSES },
        },
        data: {
          status: AppointmentStatus.CANCELLED_NO_SHOW,
          cancellationReason: 'Patient did not show up',
        },
      });
      if (updated.count === 0) continue;
      await notifyAppointmentNoShow(appt.id);
    } catch (err) {
      console.error(`[appointmentLifecycle] no-show failed for ${appt.id}:`, err);
    }
  }
}

export async function runAppointmentLifecycleJob() {
  if (running) return;
  running = true;
  const locked = await tryLifecycleLock();
  if (!locked) {
    running = false;
    return;
  }
  try {
    const now = new Date();
    await processReminders(now);
    await processNoShows(now);
  } catch (err) {
    console.error('[appointmentLifecycle] job error:', err);
  } finally {
    await releaseLifecycleLock();
    running = false;
  }
}

export function startAppointmentLifecycleJob() {
  if (timer) return;
  void runAppointmentLifecycleJob();
  timer = setInterval(() => {
    void runAppointmentLifecycleJob();
  }, INTERVAL_MS);
  writeStructuredLog('info', 'appointment_lifecycle_started', {
    intervalMs: INTERVAL_MS,
    note: 'Single-instance OK; multi-instance uses pg_try_advisory_lock',
  });
}

export function stopAppointmentLifecycleJob() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
