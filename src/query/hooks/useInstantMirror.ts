import { useEffect, useRef } from 'react';
import type { QueryClient } from '@tanstack/react-query';

/**
 * Mirrors a changing `rows` array into React Query cache, but only when the data has
 * meaningfully changed (to avoid infinite render loops when upstream returns new array references).
 *
 * This is intentionally simple:
 * - signature defaults to joined ids
 * - write is skipped if signature is unchanged
 */
export function useInstantMirror<T extends { id: string }>(params: {
  enabled: boolean;
  queryClient: QueryClient;
  queryKey: readonly unknown[];
  rows: T[];
  signature?: (rows: T[]) => string;
}) {
  const { enabled, queryClient, queryKey, rows } = params;
  const sigFn = params.signature ?? ((r: T[]) => r.map((x) => x.id).join('|'));

  const lastSig = useRef<string>('');

  // Reset signature when key changes to ensure first write occurs for new scope.
  useEffect(() => {
    lastSig.current = '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(queryKey)]);

  useEffect(() => {
    if (!enabled) return;
    const sig = sigFn(rows);
    if (lastSig.current === sig) return;
    lastSig.current = sig;
    queryClient.setQueryData(queryKey, rows);
  }, [enabled, queryClient, queryKey, rows, sigFn]);
}

