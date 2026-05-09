import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { db } from '@/src/db/instant';
import type { Transaction } from '@/src/db/types';
import { qk } from '@/src/query/keys';
import { useUserId } from '@/src/query/hooks/useUserId';
import { toIsoDate } from '@/src/utils/dates';
import { useInstantMirror } from '@/src/query/hooks/useInstantMirror';
import { isWhatIfTxn } from '@/src/features/home/transactionFilters';

/** All what-if transactions for the signed-in user (for counts + bulk delete). */
export function useWhatIfTransactions() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const lastCleanupSig = useRef<string>('');

  const instant: any = db?.useQuery(
    (userId
      ? {
          transactions: {
            $: { where: { userId, isWhatIf: true } },
          },
        }
      : {}) as any
  );

  const legacyInstant: any = db?.useQuery(
    (userId
      ? {
          transactions: {
            $: { where: { userId, matchStatus: 'what_if' } },
          },
        }
      : {}) as any
  );

  const rowsA = (instant?.data?.transactions ?? []) as Transaction[];
  const rowsB = (legacyInstant?.data?.transactions ?? []) as Transaction[];
  const rows = dedupeById([...rowsA, ...rowsB]).filter(isWhatIfTxn);
  const todayIso = toIsoDate(new Date());
  const visible = rows.filter((r) => String(r.postedAt ?? '').slice(0, 10) >= todayIso);
  const past = rows.filter((r) => String(r.postedAt ?? '').slice(0, 10) < todayIso);

  // Auto-remove expired what-ifs: once their day has passed, delete them from the DB.
  useEffect(() => {
    const client = db;
    if (!client || !userId) return;
    if (!past.length) return;
    const sig = past.map((p) => p.id).join('|');
    if (lastCleanupSig.current === sig) return;
    lastCleanupSig.current = sig;
    void client
      .transact(past.map((p) => client.tx.transactions[p.id].delete()))
      .catch(() => {
        // If deletion fails (offline, etc), we still hide them via `visible` filtering.
      });
  }, [past, userId, todayIso]);

  useInstantMirror({
    enabled: Boolean(userId),
    queryClient,
    // Back-compat with newer key signature: scenarioId omitted means base.
    queryKey: userId ? (qk as any).whatIfTransactions(userId) : ['whatIfTransactions', 'none'],
    rows: visible,
  });

  const query = useQuery({
    queryKey: userId ? (qk as any).whatIfTransactions(userId) : ['whatIfTransactions', 'none'],
    queryFn: async () => visible,
    enabled: false,
    initialData: visible,
  });

  return {
    ...query,
    data: (query.data ?? visible) as Transaction[],
    isLoading: Boolean(userId) && (Boolean(instant?.isLoading) || Boolean(legacyInstant?.isLoading)),
    error: instant?.error ?? legacyInstant?.error ?? null,
  };
}

function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const map = new Map<string, T>();
  for (const r of rows) map.set(r.id, r);
  return Array.from(map.values());
}
