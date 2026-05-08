import type { Account, ScheduledEvent, Transaction } from '@/src/db/types';
import { isWhatIfTxn } from '@/src/features/home/transactionFilters';

export type DaySummary = {
  date: string; // YYYY-MM-DD
  startBalance: number;
  income: number;
  bills: number;
  goals: number;
  other: number;
  net: number;
  endBalance: number;
};

export type ProjectionInput = {
  accounts: Account[];
  accountId: string | null;
  days: string[]; // inclusive ordered days
  scheduledEvents: ScheduledEvent[];
  transactions: Transaction[];
  /** Optional override for starting balances at the beginning of the range (accountId -> balance). */
  openingBalanceByAccountId?: Record<string, number>;
};

function isoDateFromIsoDateTime(s: string) {
  return s.slice(0, 10);
}

function addTxnToBuckets(t: Transaction, income: number, bills: number, goals: number) {
  const amt = t.amount ?? 0;
  if (isWhatIfTxn(t) && t.whatIfKind === 'goal') {
    return { income, bills, goals: goals + amt };
  }
  if (amt >= 0) return { income: income + amt, bills, goals };
  return { income, bills: bills + amt, goals };
}

export function projectDays(input: ProjectionInput): Record<string, DaySummary> {
  const { accounts, accountId, days } = input;

  const selectedAccounts = accountId ? accounts.filter((a) => a.id === accountId) : accounts;
  const opening = selectedAccounts.reduce((sum, a) => {
    const override = input.openingBalanceByAccountId?.[a.id];
    return sum + (typeof override === 'number' ? override : (a.openingBalance ?? 0));
  }, 0);

  const events = input.scheduledEvents;
  const txns = input.transactions;

  const matchedEventIds = new Set<string>();
  for (const t of txns) {
    if (t.matchedEventId) matchedEventIds.add(t.matchedEventId);
  }

  const eventsByDay = new Map<string, ScheduledEvent[]>();
  for (const e of events) {
    if (accountId && e.accountId !== accountId) continue;
    if (matchedEventIds.has(e.id)) continue;
    const arr = eventsByDay.get(e.date) ?? [];
    arr.push(e);
    eventsByDay.set(e.date, arr);
  }

  const txnsByDay = new Map<string, Transaction[]>();
  for (const t of txns) {
    if (accountId && t.accountId !== accountId) continue;
    const day = isoDateFromIsoDateTime(t.postedAt);
    const arr = txnsByDay.get(day) ?? [];
    arr.push(t);
    txnsByDay.set(day, arr);
  }

  const out: Record<string, DaySummary> = {};
  let running = opening;

  for (const date of days) {
    const dayEvents = eventsByDay.get(date) ?? [];
    const dayTxns = txnsByDay.get(date) ?? [];

    let income = 0;
    let bills = 0;
    let goals = 0;
    let other = 0;

    for (const e of dayEvents) {
      const amt = e.amount ?? 0;
      if (e.kind === 'income') income += amt;
      else if (e.kind === 'bill') bills += amt;
      else if (e.kind === 'goal') goals += amt;
      else other += amt;
    }

    for (const t of dayTxns) {
      const next = addTxnToBuckets(t, income, bills, goals);
      income = next.income;
      bills = next.bills;
      goals = next.goals;
    }

    const net = income + bills + goals + other;
    const startBalance = running;
    const endBalance = startBalance + net;
    running = endBalance;

    out[date] = {
      date,
      startBalance,
      income,
      bills,
      goals,
      other,
      net,
      endBalance,
    };
  }

  return out;
}
