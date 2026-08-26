import type { Appointment } from '@/lib/types';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export interface GroupedAppointments {
  monthKey: string;
  monthLabel: string;
  days: {
    dayKey: string;
    dayLabel: string;
    appointments: Appointment[];
  }[];
}

/** Group appointments by month → day, newest first. */
export function groupAppointmentsByMonthDay(
  appointments: Appointment[]
): GroupedAppointments[] {
  const sorted = [...appointments].sort(
    (a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()
  );
  const monthMap = new Map<
    string,
    {
      monthLabel: string;
      days: Map<string, { dayLabel: string; appointments: Appointment[] }>;
    }
  >();

  for (const appt of sorted) {
    const d = new Date(appt.scheduled_at);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    const dayKey = `${monthKey}-${String(d.getDate()).padStart(2, '0')}`;
    const dayLabel = `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;

    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, { monthLabel, days: new Map() });
    }
    const month = monthMap.get(monthKey)!;
    if (!month.days.has(dayKey)) {
      month.days.set(dayKey, { dayLabel, appointments: [] });
    }
    month.days.get(dayKey)!.appointments.push(appt);
  }

  return Array.from(monthMap.entries()).map(([monthKey, { monthLabel, days }]) => ({
    monthKey,
    monthLabel,
    days: Array.from(days.entries()).map(([dayKey, { dayLabel, appointments: dayAppts }]) => ({
      dayKey,
      dayLabel,
      appointments: dayAppts,
    })),
  }));
}

/** YYYY-MM-DD key for a Date (local timezone). */
export function toDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
