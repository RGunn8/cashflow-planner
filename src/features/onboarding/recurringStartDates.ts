import { toIsoDate } from '@/src/utils/dates';

/** Mirrors planning `nextWeekdayFromTodayUTC` / `nextMonthDayFromTodayUTC` for rule start dates. */
function startOfTodayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function nextWeekdayFromTodayUTC(targetDow: number): string {
  const base = startOfTodayUTC();
  const todayDow = base.getUTCDay();
  const delta = (targetDow - todayDow + 7) % 7;
  base.setUTCDate(base.getUTCDate() + delta);
  return toIsoDate(base);
}

export function nextMonthDayFromTodayUTC(dayOfMonth: number): string {
  const base = startOfTodayUTC();
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth();
  const today = base.getUTCDate();
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const clamped = Math.max(1, Math.min(dayOfMonth, daysInMonth));

  if (today <= clamped) {
    return toIsoDate(new Date(Date.UTC(y, m, clamped)));
  }

  const y2 = m === 11 ? y + 1 : y;
  const m2 = (m + 1) % 12;
  const daysInNext = new Date(Date.UTC(y2, m2 + 1, 0)).getUTCDate();
  const clamped2 = Math.max(1, Math.min(dayOfMonth, daysInNext));
  return toIsoDate(new Date(Date.UTC(y2, m2, clamped2)));
}
