import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { db } from '@/src/db/instant';
import type { RecurringRule } from '@/src/db/types';
import { qk } from '@/src/query/keys';
import { useUserId } from '@/src/query/hooks/useUserId';

export function useRecurringRules(params?: { accountId?: string }) {
  const userId = useUserId();
  const accountId = params?.accountId;
  const queryClient = useQueryClient();
  const lastSig = useRef<string>('');

  const instant: any = db?.useQuery(
    (userId
      ? {
          recurringRules: {
            $: { where: { userId, ...(accountId ? { accountId } : {}) } },
          },
        }
      : {}) as any
  );

  const rules = (instant?.data?.recurringRules ?? []) as RecurringRule[];

  useEffect(() => {
    if (!userId) return;
    const sig = rules.map((r) => r.id).join('|');
    if (lastSig.current === sig) return;
    lastSig.current = sig;
    queryClient.setQueryData(qk.recurringRules(userId, accountId), rules);
  }, [accountId, queryClient, rules, userId]);

  const query = useQuery({
    queryKey: userId ? qk.recurringRules(userId, accountId) : ['recurringRules', 'none'],
    queryFn: async () => rules,
    enabled: false,
    initialData: rules,
  });

  return {
    ...query,
    isLoading: Boolean(userId) && Boolean(instant?.isLoading),
    error: instant?.error ?? null,
    data: (query.data ?? []) as RecurringRule[],
  };
}

