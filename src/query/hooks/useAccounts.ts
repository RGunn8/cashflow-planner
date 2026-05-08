import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { db } from '@/src/db/instant';
import type { Account } from '@/src/db/types';
import { qk } from '@/src/query/keys';
import { useUserId } from '@/src/query/hooks/useUserId';

export function useAccounts() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const lastSig = useRef<string>('');

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

  useEffect(() => {
    if (!userId) return;
    const sig = accounts.map((a) => a.id).join('|');
    if (lastSig.current === sig) return;
    lastSig.current = sig;
    queryClient.setQueryData(qk.accounts(userId), accounts);
  }, [accounts, queryClient, userId]);

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

