import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { db } from '@/src/db/instant';
import type { ScenarioEdit } from '@/src/db/types';
import { qk } from '@/src/query/keys';

export function useScenarioEdits(scenarioId: string | null | undefined) {
  const queryClient = useQueryClient();
  const lastSig = useRef<string>('');

  useEffect(() => {
    lastSig.current = '';
  }, [scenarioId]);

  const instant: any = db?.useQuery(
    (scenarioId
      ? {
          scenarioEdits: {
            $: { where: { scenarioId } },
          },
        }
      : {}) as any
  );

  const edits = (instant?.data?.scenarioEdits ?? []) as ScenarioEdit[];

  useEffect(() => {
    if (!scenarioId) return;
    const sig = edits.map((e) => e.id).join('|');
    if (lastSig.current === sig) return;
    lastSig.current = sig;
    queryClient.setQueryData(qk.scenarioEdits(scenarioId), edits);
  }, [edits, queryClient, scenarioId]);

  const query = useQuery({
    queryKey: scenarioId ? qk.scenarioEdits(scenarioId) : ['scenarioEdits', 'none'],
    queryFn: async () => edits,
    enabled: false,
    initialData: edits,
  });

  return {
    ...query,
    isLoading: Boolean(scenarioId) && Boolean(instant?.isLoading),
    error: instant?.error ?? null,
    data: (query.data ?? []) as ScenarioEdit[],
  };
}

