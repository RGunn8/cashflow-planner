import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Swipeable } from 'react-native-gesture-handler';

import type { Transaction } from '@/src/db/types';
import { isWhatIfTxn } from '@/src/features/home/transactionFilters';

export function TransactionsFlashList(props: {
  txns: Transaction[];
  emptyHint: string;
  /** Balance after posting (excluding what-if trail). */
  runningBalanceById?: Map<string, number> | null;
  showRunningBalance?: boolean;
  /** Wrapper around the list (default: rounded top card on gray background). */
  wrapperClassName?: string;

  // Swipe-to-delete mode
  onDelete?: (txn: Transaction) => void;

  // Multi-select mode
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}) {
  const showBal = props.showRunningBalance === true;
  const wrap = props.wrapperClassName ?? 'flex-1 overflow-hidden rounded-t-3xl bg-white';
  const selectionMode = props.selectionMode === true;

  return (
    <View className={wrap}>
      <FlashList
        data={props.txns}
        keyExtractor={(t) => t.id}
        ItemSeparatorComponent={() => <View className="h-px bg-neutral-100" />}
        ListEmptyComponent={() => (
          <View className="px-4 py-6">
            <Text className="text-sm text-neutral-500">{props.emptyHint}</Text>
          </View>
        )}
        renderItem={({ item }) => {
          const isWhatIf = isWhatIfTxn(item);
          const matched = item.matchStatus === 'matched' && item.matchedEventId;
          const tags = Array.isArray(item.tags) ? (item.tags as string[]) : [];
          const statusParts: string[] = [];
          if (isWhatIf) statusParts.push('What-if');
          if (matched) statusParts.push('Matched');
          const meta = [item.postedAt.slice(0, 10), ...statusParts, ...(tags.length ? [tags.join(', ')] : [])]
            .filter(Boolean)
            .join(' • ');

          let balText = '';
          if (showBal) {
            const b = props.runningBalanceById?.get(item.id);
            balText =
              typeof b === 'number'
                ? b.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
                : '';
          }

          const selected = props.selectedIds?.has(item.id) === true;

          const rowCore = (
            <View className={selected ? 'flex-row items-center gap-3 bg-neutral-50 px-4 py-3' : 'flex-row items-center gap-3 bg-white px-4 py-3'}>
              {selectionMode ? (
                <View
                  className={
                    selected
                      ? 'h-6 w-6 items-center justify-center rounded-full bg-neutral-900'
                      : 'h-6 w-6 items-center justify-center rounded-full border border-neutral-300 bg-white'
                  }
                >
                  <Text className={selected ? 'text-xs font-semibold text-white' : 'text-xs font-semibold text-transparent'}>
                    ✓
                  </Text>
                </View>
              ) : null}

              <View className="min-w-0 flex-1">
                <Text className="text-sm font-semibold text-neutral-900" numberOfLines={1}>
                  {item.description || 'Transaction'}
                </Text>
                <Text className="mt-0.5 text-xs text-neutral-500" numberOfLines={2}>
                  {meta}
                </Text>
              </View>

              <View className="items-end">
                <Text className={item.amount >= 0 ? 'text-sm font-semibold text-emerald-700' : 'text-sm font-semibold text-rose-700'}>
                  {item.amount.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
                </Text>
                {showBal ? (
                  <Text className="mt-1 text-[11px] font-medium text-neutral-500">{balText ? `Bal ${balText}` : '—'}</Text>
                ) : null}
              </View>
            </View>
          );

          // In selection mode: tap toggles selection; disable swipe actions.
          if (selectionMode) {
            return (
              <Pressable className="bg-white" onPress={() => props.onToggleSelect?.(item.id)}>
                {rowCore}
              </Pressable>
            );
          }

          // Swipe to delete (default)
          if (!props.onDelete) return rowCore;

          return (
            <Swipeable
              renderRightActions={() => (
                <Pressable className="h-full w-24 items-center justify-center bg-rose-600" onPress={() => props.onDelete?.(item)}>
                  <Text className="text-xs font-semibold text-white">Delete</Text>
                </Pressable>
              )}
            >
              {rowCore}
            </Swipeable>
          );
        }}
      />
    </View>
  );
}
