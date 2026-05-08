import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { db } from '@/src/db/instant';
import type { Transaction } from '@/src/db/types';
import { qk } from '@/src/query/keys';
import { useUserId } from '@/src/query/hooks/useUserId';

export function useTransactions(params: { rangeKey: string; from: string; to: string; accountId?: string }) {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const lastSig = useRef<string>('');
  const { rangeKey, from, to, accountId } = params;

  const instant: any = db?.useQuery(
    (userId
      ? {
          transactions: {
            $: {
              where: {
                userId,
                ...(accountId ? { accountId } : {}),
                postedAt: { $gte: from, $lte: to },
              },
            },
          },
        }
      : {}) as any
  );

  const txns = (instant?.data?.transactions ?? []) as Transaction[];

  useEffect(() => {
    if (!userId) return;
    const sig = txns.map((t) => t.id).join('|');
    if (lastSig.current === sig) return;
    lastSig.current = sig;
    queryClient.setQueryData(qk.transactions(userId, rangeKey, accountId), txns);
  }, [accountId, queryClient, rangeKey, txns, userId]);

  const query = useQuery({
    queryKey: userId ? qk.transactions(userId, rangeKey, accountId) : ['transactions', 'none'],
    queryFn: async () => txns,
    enabled: false,
    initialData: txns,
  });

  return {
    ...query,
    isLoading: Boolean(userId) && Boolean(instant?.isLoading),
    error: instant?.error ?? null,
    data: (query.data ?? []) as Transaction[],
  };
}

