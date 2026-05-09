import { useQuery, useQueryClient } from '@tanstack/react-query';

import { db } from '@/src/db/instant';
import type { Account } from '@/src/db/types';
import { qk } from '@/src/query/keys';
import { useUserId } from '@/src/query/hooks/useUserId';
import { useInstantMirror } from '@/src/query/hooks/useInstantMirror';

export function useAccounts() {
  const userId = useUserId();
  const queryClient = useQueryClient();

  const instant: any = db?.useQuery(
    (userId
      ? {
          accounts: {
            $: { where: { userId } },
          },
        }
      : {}) as any
  );

  const accounts = (instant?.data?.accounts ?? []) as Account[];

  useInstantMirror({
    enabled: Boolean(userId),
    queryClient,
    queryKey: userId ? qk.accounts(userId) : ['accounts', 'none'],
    rows: accounts,
  });

  const query = useQuery({
    queryKey: userId ? qk.accounts(userId) : ['accounts', 'none'],
    queryFn: async () => accounts,
    enabled: false,
    initialData: accounts,
  });

  return {
    ...query,
    isLoading: Boolean(userId) && Boolean(instant?.isLoading),
    error: instant?.error ?? null,
    data: (query.data ?? []) as Account[],
  };
}

