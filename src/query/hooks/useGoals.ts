import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { db } from '@/src/db/instant';
import type { Goal } from '@/src/db/types';
import { qk } from '@/src/query/keys';
import { useUserId } from '@/src/query/hooks/useUserId';

export function useGoals() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const lastSig = useRef<string>('');

  const instant: any = db?.useQuery(
    (userId
      ? {
          goals: { $: { where: { userId } } },
        }
      : {}) as any
  );

  const goals = (instant?.data?.goals ?? []) as Goal[];

  useEffect(() => {
    if (!userId) return;
    const sig = goals.map((g) => g.id).join('|');
    if (lastSig.current === sig) return;
    lastSig.current = sig;
    queryClient.setQueryData(qk.goals(userId), goals);
  }, [goals, queryClient, userId]);

  const query = useQuery({
    queryKey: userId ? qk.goals(userId) : ['goals', 'none'],
    queryFn: async () => goals,
    enabled: false,
    initialData: goals,
  });

  return {
    ...query,
    isLoading: Boolean(userId) && Boolean(instant?.isLoading),
    error: instant?.error ?? null,
    data: (query.data ?? []) as Goal[],
  };
}

