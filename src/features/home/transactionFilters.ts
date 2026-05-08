import type { ScheduledEvent, Transaction } from '@/src/db/types';

/** True if this row is a what-if for UI + projection (handles Instant omitting optional `isWhatIf`). */
export function isWhatIfTxn(t: Transaction): boolean {
  if (t.isWhatIf === true) return true;
  return t.matchStatus === 'what_if';
}

/** True if this transaction row is one half of a transfer pair. */
export function isTransferTxn(t: Transaction): boolean {
  if ((t as any).transferId) return true;
  return t.matchStatus === 'transfer';
}

/** Income / Bills / Goals section for a what-if row when kind is missing or legacy data (matches projection bucketing). */
export function whatIfDetailBucket(t: Transaction): 'income' | 'bill' | 'goal' | null {
  if (!isWhatIfTxn(t)) return null;
  const k = t.whatIfKind;
  if (k === 'goal') return 'goal';
  if (k === 'income') return 'income';
  if (k === 'bill') return 'bill';
  const amt = t.amount ?? 0;
  if (amt > 0) return 'income';
  if (amt < 0) return 'bill';
  return 'income';
}

function inferredWhatIfKindForFilter(t: Transaction): 'income' | 'bill' | 'goal' {
  const b = whatIfDetailBucket(t);
  return b ?? 'income';
}

/** Transactions included in projection + day list when pills are on (true = show that category). */
export function filterTransactionsForHomeView(
  txns: Transaction[],
  opts: { showWhatIf: boolean; showIncome: boolean; showBills: boolean; showGoals: boolean }
): Transaction[] {
  const { showWhatIf, showIncome, showBills, showGoals } = opts;
  return txns.filter((t) => {
    if (!showWhatIf && isWhatIfTxn(t)) return false;

    if (isWhatIfTxn(t)) {
      const kind = inferredWhatIfKindForFilter(t);
      if (kind === 'income' && !showIncome) return false;
      if (kind === 'bill' && !showBills) return false;
      if (kind === 'goal' && !showGoals) return false;
      return true;
    }

    if (isTransferTxn(t)) return true;

    const amt = t.amount ?? 0;
    if (amt > 0 && !showIncome) return false;
    if (amt < 0 && !showBills) return false;
    return true;
  });
}

export function filterScheduledEventsForHomeView(
  events: ScheduledEvent[],
  opts: { showIncome: boolean; showBills: boolean; showGoals: boolean }
): ScheduledEvent[] {
  const { showIncome, showBills, showGoals } = opts;
  return events.filter((e) => {
    if (e.kind === 'income' && !showIncome) return false;
    if (e.kind === 'bill' && !showBills) return false;
    if (e.kind === 'goal' && !showGoals) return false;
    return true;
  });
}
