export function parseIsoDate(iso: string) {
  const [y, m, d] = iso.split('-').map((v) => Number(v));
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, delta: number) {
  const d = parseIsoDate(iso);
  d.setUTCDate(d.getUTCDate() + delta);
  return toIsoDate(d);
}

export function startOfWeek(iso: string) {
  const d = parseIsoDate(iso);
  const dow = d.getUTCDay(); // 0..6 Sunday..Saturday
  d.setUTCDate(d.getUTCDate() - dow);
  return toIsoDate(d);
}

export function formatMonthDay(iso: string) {
  const d = parseIsoDate(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function formatWeekdayShort(iso: string) {
  const d = parseIsoDate(iso);
  return d.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
}

export function startOfMonth(iso: string) {
  const d = parseIsoDate(iso);
  return toIsoDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
}

export function daysInMonthCount(iso: string) {
  const d = parseIsoDate(iso);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

/** Preserves day-of-month when possible (e.g. Jan 31 → Feb 28/29). */
export function addMonths(iso: string, delta: number) {
  const d = parseIsoDate(iso);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(y, m + delta, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return toIsoDate(target);
}

export function formatMonthYear(iso: string) {
  const d = parseIsoDate(iso);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Last calendar day (YYYY-MM-DD) of the month containing `iso`. */
export function endOfMonth(iso: string) {
  return addDays(startOfMonth(iso), daysInMonthCount(iso) - 1);
}

/**
 * Full weeks covering a calendar month: pads leading days from the previous month
 * and trailing days into the next so every row has 7 columns.
 */
export function monthCalendarGridDays(focusIso: string): string[] {
  const monthStart = startOfMonth(focusIso);
  const monthEnd = endOfMonth(focusIso);
  const gridStart = startOfWeek(monthStart);

  let cursor = gridStart;
  const out: string[] = [];
  while (true) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
    if (cursor > monthEnd && out.length % 7 === 0) break;
  }
  return out;
}

