import type { Account, Transaction } from '@/src/db/types';
import { isWhatIfTxn } from '@/src/features/home/transactionFilters';

export type BalanceMap = Record<string, number>; // accountId -> balance

/**
 * Compute balances as-of a timestamp.
 * - Includes all non-what-if transactions with postedAt <= asOfIsoDateTime.
 * - Starts from accounts.openingBalance.
 */
export function computeActualBalancesAsOf(params: {
  accounts: Account[];
  transactions: Transaction[];
  asOfIsoDateTime: string; // inclusive
}): BalanceMap {
  const { accounts, transactions, asOfIsoDateTime } = params;

  const out: BalanceMap = {};
  for (const a of accounts) out[a.id] = (a.openingBalance ?? 0) as number;

  for (const t of transactions) {
    if (!t.accountId) continue;
    if (!t.postedAt) continue;
    if (t.postedAt > asOfIsoDateTime) continue;
    if (isWhatIfTxn(t)) continue;

    const prev = out[t.accountId] ?? 0;
    out[t.accountId] = prev + (t.amount ?? 0);
  }

  return out;
}
