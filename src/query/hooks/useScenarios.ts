import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { db } from '@/src/db/instant';
import type { Scenario } from '@/src/db/types';
import { qk } from '@/src/query/keys';
import { useUserId } from '@/src/query/hooks/useUserId';

export function useScenarios() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const lastSig = useRef<string>('');

  useEffect(() => {
    lastSig.current = '';
  }, [userId]);

  const instant: any = db?.useQuery(
    (userId
      ? {
          scenarios: { $: { where: { userId } } },
        }
      : {}) as any
  );

  const scenarios = (instant?.data?.scenarios ?? []) as Scenario[];

  useEffect(() => {
    if (!userId) return;
    const sig = scenarios.map((s) => s.id).join('|');
    if (lastSig.current === sig) return;
    lastSig.current = sig;
    queryClient.setQueryData(qk.scenarios(userId), scenarios);
  }, [queryClient, scenarios, userId]);

  const query = useQuery({
    queryKey: userId ? qk.scenarios(userId) : ['scenarios', 'none'],
    queryFn: async () => scenarios,
    enabled: false,
    initialData: scenarios,
  });

  return {
    ...query,
    isLoading: Boolean(userId) && Boolean(instant?.isLoading),
    error: instant?.error ?? null,
    data: (query.data ?? []) as Scenario[],
  };
}

