import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';

import { db } from '@/src/db/instant';
import type { Transaction } from '@/src/db/types';
import { qk } from '@/src/query/keys';
import { useUserId } from '@/src/query/hooks/useUserId';

/**
 * Loads all transactions for the user (no date filter) and derives unique tag strings.
 * Used for tag autocomplete across the app; can be heavy for very large histories.
 */
export function useTransactionTags() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const lastSig = useRef<string>('');

  useEffect(() => {
    lastSig.current = '';
  }, [userId]);

  const instant: any = db?.useQuery((userId ? { transactions: { $: { where: { userId } } } } : {}) as any);

  const txns = (instant?.data?.transactions ?? []) as Transaction[];

  const tags = useMemo(() => {
    const out = new Set<string>();
    for (const t of txns) {
      if (!Array.isArray(t.tags)) continue;
      for (const x of t.tags) {
        if (typeof x === 'string' && x.trim()) out.add(x.trim());
      }
    }
    return Array.from(out).sort((a, b) => a.localeCompare(b));
  }, [txns]);

  useEffect(() => {
    if (!userId) return;
    const sig = tags.join('|');
    if (lastSig.current === sig) return;
    lastSig.current = sig;
    queryClient.setQueryData(qk.transactionTags(userId), tags);
  }, [queryClient, tags, userId]);

  const query = useQuery({
    queryKey: userId ? qk.transactionTags(userId) : ['transactionTags', 'none'],
    queryFn: async () => tags,
    enabled: false,
    initialData: tags,
  });

  return {
    ...query,
    data: (query.data ?? tags) as string[],
    isLoading: Boolean(userId) && Boolean(instant?.isLoading),
    error: instant?.error ?? null,
  };
}
