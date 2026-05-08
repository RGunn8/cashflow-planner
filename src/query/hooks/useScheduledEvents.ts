import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { db } from '@/src/db/instant';
import type { ScheduledEvent } from '@/src/db/types';
import { qk } from '@/src/query/keys';
import { useUserId } from '@/src/query/hooks/useUserId';

export function useScheduledEvents(params: { rangeKey: string; from: string; to: string; accountId?: string; scenarioId?: string }) {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const lastSig = useRef<string>('');
  const { rangeKey, from, to, accountId, scenarioId } = params;

  const instant: any = db?.useQuery(
    (userId
      ? {
          scheduledEvents: {
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

  const all = (instant?.data?.scheduledEvents ?? []) as ScheduledEvent[];
  // Filter client-side so the app still works even if the remote schema
  // hasn't been updated to index `scheduledEvents.date` yet.
  const events = all.filter((e) => e.date >= from && e.date <= to);

  useEffect(() => {
    if (!userId) return;
    const sig = events.map((e) => e.id).join('|');
    if (lastSig.current === sig) return;
    lastSig.current = sig;
    queryClient.setQueryData(qk.scheduledEvents(userId, rangeKey, accountId, scenarioId), events);
  }, [accountId, events, queryClient, rangeKey, scenarioId, userId]);

  const query = useQuery({
    queryKey: userId ? qk.scheduledEvents(userId, rangeKey, accountId, scenarioId) : ['scheduledEvents', 'none'],
    queryFn: async () => events,
    enabled: false,
    initialData: events,
  });

  return {
    ...query,
    isLoading: Boolean(userId) && Boolean(instant?.isLoading),
    error: instant?.error ?? null,
    data: (query.data ?? []) as ScheduledEvent[],
  };
}

