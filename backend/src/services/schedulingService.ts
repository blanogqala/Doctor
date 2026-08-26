import { AppointmentStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';

export const GAP_MINUTES = 5;
export const SLOT_GRID_MINUTES = 5;
export const DEFAULT_DURATION_MINUTES = 30;

const BLOCKING_STATUSES: AppointmentStatus[] = [
  'PENDING',
  'CONFIRMED',
  'IN_CONSULTATION',
  'PENDING_IN_PERSON',
  'CONFIRMED_IN_PERSON',
  'CONFIRMED_TELEMEDICINE',
  'ARRIVED',
];

const DELAYABLE_STATUSES: AppointmentStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PENDING_IN_PERSON',
  'CONFIRMED_IN_PERSON',
  'CONFIRMED_TELEMEDICINE',
  'ARRIVED',
  'IN_CONSULTATION',
];

export interface TimeInterval {
  start: Date;
  end: Date;
}

export function parseDateOnly(dateStr: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) throw new AppError(400, 'Invalid date. Use YYYY-MM-DD.');
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function dayBounds(dateStr: string): { start: Date; end: Date } {
  const { year, month, day } = parseDateOnly(dateStr);
  return {
    start: new Date(year, month - 1, day, 0, 0, 0, 0),
    end: new Date(year, month - 1, day, 23, 59, 59, 999),
  };
}

/** UTC midnight for Prisma `@db.Date` columns (avoids TZ day-shift). */
export function dateOnlyUtc(dateStr: string): Date {
  const { year, month, day } = parseDateOnly(dateStr);
  return new Date(Date.UTC(year, month - 1, day));
}

export function atMinute(dateStr: string, minute: number): Date {
  const { year, month, day } = parseDateOnly(dateStr);
  return new Date(year, month - 1, day, Math.floor(minute / 60), minute % 60, 0, 0);
}

export function toDateOnlyString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function intervalsOverlap(a: TimeInterval, b: TimeInterval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function blockedInterval(scheduledAt: Date, durationMinutes: number): TimeInterval {
  return {
    start: scheduledAt,
    end: new Date(scheduledAt.getTime() + (durationMinutes + GAP_MINUTES) * 60_000),
  };
}

export function bookingInterval(scheduledAt: Date, durationMinutes: number): TimeInterval {
  return {
    start: scheduledAt,
    end: new Date(scheduledAt.getTime() + durationMinutes * 60_000),
  };
}

function weekDates(weekStartStr: string): string[] {
  const { year, month, day } = parseDateOnly(weekStartStr);
  const start = new Date(year, month - 1, day);
  // Normalize to Monday of that week if needed — caller sends week_start as Monday
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    dates.push(toDateOnlyString(d));
  }
  return dates;
}

export async function listAvailabilityWindows(doctorId: string, from: string, to: string) {
  return prisma.doctorAvailabilityWindow.findMany({
    where: {
      doctorId,
      date: { gte: dateOnlyUtc(from), lte: dateOnlyUtc(to) },
    },
    orderBy: [{ date: 'asc' }, { startMinute: 'asc' }],
  });
}

export async function replaceWeekAvailability(
  doctorId: string,
  weekStart: string,
  days: Array<{ date: string; blocks: Array<{ start_minute: number; end_minute: number }> }>
) {
  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor) throw new AppError(404, 'Doctor not found');

  const allowed = new Set(weekDates(weekStart));
  for (const day of days) {
    if (!allowed.has(day.date)) {
      throw new AppError(400, `Date ${day.date} is outside the selected week`);
    }
    for (const block of day.blocks) {
      if (
        !Number.isInteger(block.start_minute) ||
        !Number.isInteger(block.end_minute) ||
        block.start_minute < 0 ||
        block.end_minute > 24 * 60 ||
        block.start_minute >= block.end_minute
      ) {
        throw new AppError(400, `Invalid time block on ${day.date}`);
      }
    }
  }

  const weekDayDates = [...allowed].sort();
  const first = dateOnlyUtc(weekDayDates[0]);
  const last = dateOnlyUtc(weekDayDates[6]);

  await prisma.$transaction(async (tx) => {
    await tx.doctorAvailabilityWindow.deleteMany({
      where: { doctorId, date: { gte: first, lte: last } },
    });

    const rows: Prisma.DoctorAvailabilityWindowCreateManyInput[] = [];
    for (const day of days) {
      for (const block of day.blocks) {
        rows.push({
          doctorId,
          date: dateOnlyUtc(day.date),
          startMinute: block.start_minute,
          endMinute: block.end_minute,
        });
      }
    }
    if (rows.length) {
      await tx.doctorAvailabilityWindow.createMany({ data: rows });
    }
  });

  return listAvailabilityWindows(doctorId, weekDayDates[0], weekDayDates[6]);
}

export async function getActiveBlockedIntervals(
  doctorId: string,
  dateStr: string,
  excludeAppointmentId?: string
): Promise<TimeInterval[]> {
  const { start, end } = dayBounds(dateStr);
  const appts = await prisma.appointment.findMany({
    where: {
      doctorId,
      softDeletedAt: null,
      status: { in: BLOCKING_STATUSES },
      scheduledAt: { gte: start, lte: end },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
    },
    select: { scheduledAt: true, durationMinutes: true },
  });
  return appts.map((a) => blockedInterval(a.scheduledAt, a.durationMinutes));
}

export async function assertSlotAvailable(opts: {
  doctorId: string;
  scheduledAt: Date;
  durationMinutes: number;
  excludeAppointmentId?: string;
}) {
  const dateStr = toDateOnlyString(opts.scheduledAt);
  const startMin = minutesOfDay(opts.scheduledAt);
  const endMin = startMin + opts.durationMinutes;

  const windows = await prisma.doctorAvailabilityWindow.findMany({
    where: { doctorId: opts.doctorId, date: dateOnlyUtc(dateStr) },
  });

  if (windows.length === 0) {
    throw new AppError(409, 'Doctor is not available on this date');
  }

  const fitsWindow = windows.some((w) => startMin >= w.startMinute && endMin <= w.endMinute);
  if (!fitsWindow) {
    throw new AppError(409, 'Selected time is outside doctor availability');
  }

  const booking = bookingInterval(opts.scheduledAt, opts.durationMinutes);
  // Occupancy includes gap for conflict with other bookings' blocked ranges
  const occupancy = blockedInterval(opts.scheduledAt, opts.durationMinutes);
  const blocked = await getActiveBlockedIntervals(
    opts.doctorId,
    dateStr,
    opts.excludeAppointmentId
  );

  for (const b of blocked) {
    // New booking's occupied window (duration+gap) must not overlap existing occupied windows
    // Compare using occupancy vs existing blocked (which already include gap)
    // Actually: two appointments conflict if their [start, start+duration+gap) overlap
    if (intervalsOverlap(occupancy, b)) {
      throw new AppError(409, 'This time slot conflicts with another appointment (including the 5-minute gap)');
    }
  }

  // Also ensure the consultation itself doesn't start inside another consult without counting double-gap oddly —
  // blockedInterval already handles duration+gap overlap.
  void booking;
}

export async function generateSlots(opts: {
  doctorId: string;
  date: string;
  durationMinutes?: number;
  excludeAppointmentId?: string;
}): Promise<Array<{ start: string; end: string }>> {
  const duration = opts.durationMinutes ?? DEFAULT_DURATION_MINUTES;
  const windows = await prisma.doctorAvailabilityWindow.findMany({
    where: { doctorId: opts.doctorId, date: dateOnlyUtc(opts.date) },
    orderBy: { startMinute: 'asc' },
  });
  if (!windows.length) return [];

  const blocked = await getActiveBlockedIntervals(
    opts.doctorId,
    opts.date,
    opts.excludeAppointmentId
  );

  const now = new Date();
  const slots: Array<{ start: string; end: string }> = [];

  for (const w of windows) {
    for (let m = w.startMinute; m + duration <= w.endMinute; m += SLOT_GRID_MINUTES) {
      const start = atMinute(opts.date, m);
      if (start <= now) continue;
      const occupancy = blockedInterval(start, duration);
      const conflict = blocked.some((b) => intervalsOverlap(occupancy, b));
      if (conflict) continue;
      const end = new Date(start.getTime() + duration * 60_000);
      slots.push({ start: start.toISOString(), end: end.toISOString() });
    }
  }

  return slots;
}

export async function cascadeDelayOnComplete(appointmentId: string) {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt || appt.softDeletedAt) return;

  // Prefer real consult start; if missing (legacy / server not restarted), use scheduled start
  // so late completions still produce a visible delay for later patients.
  const startedAt = appt.consultationStartedAt ?? appt.scheduledAt;
  const actualMinutes = Math.max(
    0,
    Math.round((Date.now() - startedAt.getTime()) / 60_000)
  );
  const overrun = Math.max(0, actualMinutes - appt.durationMinutes);
  if (overrun === 0) return;

  const dateStr = toDateOnlyString(appt.scheduledAt);
  const { start, end } = dayBounds(dateStr);

  await prisma.appointment.updateMany({
    where: {
      doctorId: appt.doctorId,
      softDeletedAt: null,
      id: { not: appt.id },
      scheduledAt: { gt: appt.scheduledAt, gte: start, lte: end },
      status: { in: DELAYABLE_STATUSES },
    },
    data: { delayMinutes: { increment: overrun } },
  });
}
