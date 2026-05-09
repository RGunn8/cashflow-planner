import { useQuery, useQueryClient } from '@tanstack/react-query';

import { db } from '@/src/db/instant';
import type { Transaction } from '@/src/db/types';
import { qk } from '@/src/query/keys';
import { useUserId } from '@/src/query/hooks/useUserId';
import { useInstantMirror } from '@/src/query/hooks/useInstantMirror';

export function useTransactions(params: { rangeKey: string; from: string; to: string; accountId?: string }) {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const { rangeKey, from, to, accountId } = params;

  const instant: any = db?.useQuery(
    (userId
      ? {
          transactions: {
            $: {
              where: {
                userId,
                ...(accountId ? { accountId } : {}),
              },
            },
          },
        }
      : {}) as any
  );

  const rows = (instant?.data?.transactions ?? []) as Transaction[];
  const txns = rows.filter((t) => {
    const d = String(t.postedAt ?? '').slice(0, 10);
    if (!d) return false;
    return d >= from.slice(0, 10) && d <= to.slice(0, 10);
  });

  useInstantMirror({
    enabled: Boolean(userId),
    queryClient,
    queryKey: userId ? qk.transactions(userId, rangeKey, accountId) : ['transactions', 'none'],
    rows: txns,
  });

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

