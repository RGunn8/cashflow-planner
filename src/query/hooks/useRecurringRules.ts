import { useQuery, useQueryClient } from '@tanstack/react-query';

import { db } from '@/src/db/instant';
import type { RecurringRule } from '@/src/db/types';
import { qk } from '@/src/query/keys';
import { useUserId } from '@/src/query/hooks/useUserId';
import { useInstantMirror } from '@/src/query/hooks/useInstantMirror';

export function useRecurringRules(params?: { accountId?: string }) {
  const userId = useUserId();
  const accountId = params?.accountId;
  const queryClient = useQueryClient();

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

  useInstantMirror({
    enabled: Boolean(userId),
    queryClient,
    queryKey: userId ? qk.recurringRules(userId, accountId) : ['recurringRules', 'none'],
    rows: rules,
  });

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

