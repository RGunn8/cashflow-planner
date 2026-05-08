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

