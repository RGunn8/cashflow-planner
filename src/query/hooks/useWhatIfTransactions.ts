import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { db } from '@/src/db/instant';
import type { Transaction } from '@/src/db/types';
import { qk } from '@/src/query/keys';
import { useUserId } from '@/src/query/hooks/useUserId';
import { toIsoDate } from '@/src/utils/dates';

/** All what-if transactions for the signed-in user (for counts + bulk delete). */
export function useWhatIfTransactions() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const lastSig = useRef<string>('');
  const lastCleanupSig = useRef<string>('');

  useEffect(() => {
    lastSig.current = '';
  }, [userId]);

  const instant: any = db?.useQuery(
    (userId
      ? {
          transactions: {
            $: { where: { userId, matchStatus: 'what_if' } },
          },
        }
      : {}) as any
  );

  const rows = (instant?.data?.transactions ?? []) as Transaction[];
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

  useEffect(() => {
    if (!userId) return;
    const sig = visible.map((r) => r.id).join('|');
    if (lastSig.current === sig) return;
    lastSig.current = sig;
    // Back-compat with newer key signature: scenarioId omitted means base.
    queryClient.setQueryData((qk as any).whatIfTransactions(userId), visible);
  }, [queryClient, userId, visible]);

  const query = useQuery({
    queryKey: userId ? (qk as any).whatIfTransactions(userId) : ['whatIfTransactions', 'none'],
    queryFn: async () => visible,
    enabled: false,
    initialData: visible,
  });

  return {
    ...query,
    data: (query.data ?? visible) as Transaction[],
    isLoading: Boolean(userId) && Boolean(instant?.isLoading),
    error: instant?.error ?? null,
  };
}
