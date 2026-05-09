import { useQuery, useQueryClient } from '@tanstack/react-query';

import { db } from '@/src/db/instant';
import type { Goal } from '@/src/db/types';
import { qk } from '@/src/query/keys';
import { useUserId } from '@/src/query/hooks/useUserId';
import { useInstantMirror } from '@/src/query/hooks/useInstantMirror';

export function useGoals() {
  const userId = useUserId();
  const queryClient = useQueryClient();

  const instant: any = db?.useQuery(
    (userId
      ? {
          goals: { $: { where: { userId } } },
        }
      : {}) as any
  );

  const goals = (instant?.data?.goals ?? []) as Goal[];

  useInstantMirror({
    enabled: Boolean(userId),
    queryClient,
    queryKey: userId ? qk.goals(userId) : ['goals', 'none'],
    rows: goals,
  });

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

