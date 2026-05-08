import type { ScheduledEvent, Transaction } from '@/src/db/types';
import { parseIsoDate } from '@/src/utils/dates';

export type MatchCandidate = {
  event: ScheduledEvent;
  score: number;
};

function daysBetween(aIso: string, bIso: string) {
  const a = parseIsoDate(aIso);
  const b = parseIsoDate(bIso);
  const ms = Math.abs(a.getTime() - b.getTime());
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

export function candidatesForTransaction(params: {
  txn: Transaction;
  events: ScheduledEvent[];
  windowDays?: number;
}): MatchCandidate[] {
  const windowDays = params.windowDays ?? 3;
  const txnDay = params.txn.postedAt.slice(0, 10);
  const txnAmt = params.txn.amount ?? 0;

  const out: MatchCandidate[] = [];

  for (const e of params.events) {
    if (e.status === 'matched') continue;
    if (e.accountId !== params.txn.accountId) continue;

    const d = daysBetween(txnDay, e.date);
    if (d > windowDays) continue;

    const eventAmt = e.amount ?? 0;
    if (Math.abs(eventAmt) !== Math.abs(txnAmt)) continue;

    // Prefer exact date
    const score = 100 - d * 10;
    out.push({ event: e, score });
  }

  return out.sort((a, b) => b.score - a.score);
}

export function bestMatch(params: { txn: Transaction; events: ScheduledEvent[] }) {
  const c = candidatesForTransaction({ txn: params.txn, events: params.events });
  return c[0]?.event ?? null;
}

