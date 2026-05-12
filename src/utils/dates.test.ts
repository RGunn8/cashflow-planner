import { addDays, addMonths, daysInMonthCount, monthCalendarGridDays, startOfWeek } from '@/src/utils/dates';

describe('dates utils', () => {
  it('addDays works across month boundaries (UTC)', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('startOfWeek returns Sunday for a given date (UTC)', () => {
    // 2026-05-06 is a Wednesday; start of week should be Sunday 2026-05-03
    expect(startOfWeek('2026-05-06')).toBe('2026-05-03');
  });

  it('addMonths preserves day-of-month when possible and clamps at month end', () => {
    // Jan 31 -> Feb 28 (2026 is not leap year)
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    // Mar 31 -> Apr 30
    expect(addMonths('2026-03-31', 1)).toBe('2026-04-30');
  });

  it('daysInMonthCount returns correct day count', () => {
    expect(daysInMonthCount('2026-02-01')).toBe(28);
    expect(daysInMonthCount('2024-02-01')).toBe(29);
  });

  it('monthCalendarGridDays returns full weeks (multiple of 7) covering the month', () => {
    const grid = monthCalendarGridDays('2026-05-15');
    expect(grid.length % 7).toBe(0);
    // grid should start on Sunday
    expect(startOfWeek(grid[0])).toBe(grid[0]);
    // should include the month start and end
    expect(grid).toContain('2026-05-01');
    expect(grid).toContain('2026-05-31');
  });
});
