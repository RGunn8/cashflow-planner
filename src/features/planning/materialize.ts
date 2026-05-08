import type { RecurringRule, ScheduledEvent } from '@/src/db/types';
import { addDays, parseIsoDate, toIsoDate } from '@/src/utils/dates';
import { newId } from '@/src/utils/uuid';

function addMonths(iso: string, months: number) {
  const d = parseIsoDate(iso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return toIsoDate(d);
}

function nextDate(from: string, cadence: string) {
  if (cadence === 'weekly') return addDays(from, 7);
  if (cadence === 'biweekly') return addDays(from, 14);
  if (cadence === 'monthly') return addMonths(from, 1);
  return addDays(from, 30);
}

export function materializeScheduledEvents(params: {
  rule: RecurringRule;
  userId: string;
  horizonDays?: number;
}): ScheduledEvent[] {
  const { rule, userId } = params;
  const horizonDays = params.horizonDays ?? 90;

  const start = rule.nextRunAt?.slice(0, 10) || rule.startDate;
  const end = addDays(toIsoDate(new Date()), horizonDays);

  const out: ScheduledEvent[] = [];
  let cursor = start;

  while (cursor <= end) {
    if (rule.kind === 'transfer') {
      // Transfers emit a paired (-) row on the from-account and (+) row on the to-account,
      // sharing a transferId so the UI / projection can recognize them as one move.
      const amt = Math.abs(rule.amount ?? 0);
      const toAccountId = (rule as any).toAccountId as string | undefined;

      if (toAccountId) {
        const transferId = newId();

        out.push({
          id: newId(),
          userId,
          accountId: rule.accountId,
          ruleId: rule.id,
          date: cursor,
          amount: -amt,
          kind: 'transfer',
          status: 'scheduled',
          transferId,
          toAccountId,
        } as ScheduledEvent);

        out.push({
          id: newId(),
          userId,
          accountId: toAccountId,
          ruleId: rule.id,
          date: cursor,
          amount: amt,
          kind: 'transfer',
          status: 'scheduled',
          transferId,
          toAccountId,
        } as ScheduledEvent);
      }
    } else {
      const amountSigned =
        rule.kind === 'bill' || rule.kind === 'goal'
          ? -Math.abs(rule.amount ?? 0)
          : Math.abs(rule.amount ?? 0);

      out.push({
        id: newId(),
        userId,
        accountId: rule.accountId,
        ruleId: rule.id,
        date: cursor,
        amount: amountSigned,
        kind: rule.kind,
        status: 'scheduled',
      } as ScheduledEvent);
    }

    cursor = nextDate(cursor, rule.cadence);
    if (rule.endDate && cursor > rule.endDate) break;
  }

  return out;
}
