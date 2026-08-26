/** Local calendar day bounds as ISO strings for appointment list queries. */
export function todayBounds(now: Date = new Date()): { from: string; to: string } {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { from: today.toISOString(), to: tomorrow.toISOString() };
}
