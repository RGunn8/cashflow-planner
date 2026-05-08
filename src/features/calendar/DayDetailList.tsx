import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';

export type DayDetailItem =
  | { type: 'section'; id: string; title: string }
  | {
      type: 'row';
      id: string;
      title: string;
      subtitle?: string;
      amount?: number;
      kind?: 'income' | 'bill' | 'goal' | 'txn' | 'whatif' | 'transfer';
      /** Account color dot (hex), used to visually distinguish accounts. */
      dotColor?: string;
    };

function formatCurrency(amount: number) {
  return amount.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function amountClassForKind(kind: Extract<DayDetailItem, { type: 'row' }>['kind'] | undefined) {
  switch (kind) {
    case 'income':
      return 'text-emerald-700';
    case 'bill':
      return 'text-rose-700';
    case 'goal':
      return 'text-amber-700';
    case 'whatif':
      return 'text-violet-600';
    case 'transfer':
      return 'text-sky-700';
    default:
      return 'text-neutral-800';
  }
}

export function DayDetailList(props: { items: DayDetailItem[] }) {
  const data = useMemo(() => props.items ?? [], [props.items]);

  return (
    <FlashList
      className="flex-1"
      data={data}
      keyExtractor={(item) => item.id}
      ItemSeparatorComponent={() => <View className="h-px bg-neutral-100" />}
      ListEmptyComponent={() => (
        <View className="px-4 py-6">
          <Text className="text-sm text-neutral-500">No activity for this day.</Text>
        </View>
      )}
      renderItem={({ item }) => {
        if (item.type === 'section') {
          return (
            <View className="bg-neutral-50 px-4 py-2">
              <Text className="text-xs font-semibold text-neutral-600">{item.title}</Text>
            </View>
          );
        }

        const amountCls = amountClassForKind(item.kind);

        return (
          <View className="flex-row items-center justify-between bg-white px-4 py-3">
            <View className="flex-1 flex-row items-center gap-3 pr-4">
              {item.dotColor ? <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.dotColor }} /> : null}
              <View className="flex-1">
                <Text className="text-sm font-semibold text-neutral-900" numberOfLines={1}>
                  {item.title}
                </Text>
                {item.subtitle ? (
                  <Text className="mt-0.5 text-xs text-neutral-500" numberOfLines={1}>
                    {item.subtitle}
                  </Text>
                ) : null}
              </View>
            </View>
            {typeof item.amount === 'number' ? <Text className={`text-sm font-semibold ${amountCls}`}>{formatCurrency(item.amount)}</Text> : null}
          </View>
        );
      }}
    />
  );
}
