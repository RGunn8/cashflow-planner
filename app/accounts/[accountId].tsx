import React, { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { db } from '@/src/db/instant';
import { useAccounts } from '@/src/query/hooks/useAccounts';
import { useScheduledEvents } from '@/src/query/hooks/useScheduledEvents';
import { useTransactions } from '@/src/query/hooks/useTransactions';
import { useAppStore } from '@/src/state/useAppStore';
import { addDays, toIsoDate } from '@/src/utils/dates';

const ACCOUNT_COLORS = [
  '#2563eb',
  '#16a34a',
  '#f97316',
  '#db2777',
  '#7c3aed',
  '#0891b2',
  '#ca8a04',
  '#0f766e',
  '#4f46e5',
  '#dc2626',
];

function fallbackAccountColor(accountId: string): string {
  let h = 0;
  for (let i = 0; i < accountId.length; i++) h = (h * 31 + accountId.charCodeAt(i)) >>> 0;
  return ACCOUNT_COLORS[h % ACCOUNT_COLORS.length];
}

function ColorDot({ color, active }: { color: string; active: boolean }) {
  return (
    <View
      className={active ? 'h-8 w-8 items-center justify-center rounded-full border-2 border-neutral-900' : 'h-8 w-8 rounded-full border border-neutral-200'}
    >
      <View className="h-6 w-6 rounded-full" style={{ backgroundColor: color }} />
    </View>
  );
}

export default function AccountDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ accountId: string }>();
  const accountId = params.accountId;

  const setSelectedAccountId = useAppStore((s) => s.setSelectedAccountId);

  const accountsQ = useAccounts();
  const account = useMemo(() => (accountsQ.data ?? []).find((a) => a.id === accountId) ?? null, [accountId, accountsQ.data]);

  const [savingColor, setSavingColor] = useState(false);

  const today = toIsoDate(new Date());
  const fromDay = addDays(today, -30);
  const toDay = today;
  const rangeKey = `${fromDay}_${toDay}`;

  const txnsQ = useTransactions({
    rangeKey,
    from: `${fromDay}T00:00:00.000Z`,
    to: `${toDay}T23:59:59.999Z`,
    accountId,
  });
  const eventsQ = useScheduledEvents({ rangeKey, from: fromDay, to: toDay, accountId });

  if (!account) {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-100 px-6">
        <Text className="text-base text-neutral-700">Account not found.</Text>
      </View>
    );
  }

  const acctId = account.id;
  const currentColor = (account as any)?.color ?? fallbackAccountColor(acctId);

  async function saveColor(color: string) {
    if (!db) return;
    try {
      setSavingColor(true);
      await db.transact([db.tx.accounts[acctId].update({ color })]);
    } catch (e: any) {
      Alert.alert('Could not save color', e?.message ?? 'Unknown error');
    } finally {
      setSavingColor(false);
    }
  }

  return (
    <View className="flex-1 bg-neutral-100">
      <View className="px-4 pb-3 pt-14">
        <View className="flex-row items-center justify-between">
          <Pressable onPress={() => router.back()}>
            <Text className="text-sm font-semibold text-neutral-700">Back</Text>
          </Pressable>
          <Pressable
            className="rounded-xl bg-neutral-900 px-3 py-2"
            onPress={() => {
              setSelectedAccountId(acctId);
              router.back();
            }}
          >
            <Text className="text-xs font-semibold text-white">Make active</Text>
          </Pressable>
        </View>

        <View className="mt-3 flex-row items-center gap-3">
          <View className="h-3 w-3 rounded-full" style={{ backgroundColor: currentColor }} />
          <Text className="text-2xl font-bold text-neutral-900">{account.name}</Text>
        </View>
        <Text className="mt-1 text-sm text-neutral-600">
          Opening {account.openingBalance.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
        </Text>
      </View>

      <View className="flex-1 overflow-hidden rounded-t-3xl bg-white p-4">
        <Text className="text-xs font-semibold text-neutral-600">Account color</Text>
        <Text className="mt-1 text-xs text-neutral-500">Used to color-code calendar and activity.</Text>

        <View className="mt-3 flex-row flex-wrap gap-2">
          {ACCOUNT_COLORS.map((c) => {
            const active = c.toLowerCase() === String(currentColor).toLowerCase();
            return (
              <Pressable
                key={c}
                onPress={() => saveColor(c)}
                disabled={savingColor}
                style={({ pressed }) => [{ opacity: savingColor ? 0.4 : pressed ? 0.85 : 1 }]}
              >
                <ColorDot color={c} active={active} />
              </Pressable>
            );
          })}
        </View>

        <View className="mt-6">
          <Text className="text-xs font-semibold text-neutral-600">This month</Text>
          <View className="mt-3 flex-row justify-between">
            <View>
              <Text className="text-xs text-neutral-500">Scheduled events</Text>
              <Text className="mt-1 text-lg font-bold text-neutral-900">{(eventsQ.data ?? []).length}</Text>
            </View>
            <View>
              <Text className="text-xs text-neutral-500">Transactions</Text>
              <Text className="mt-1 text-lg font-bold text-neutral-900">{(txnsQ.data ?? []).length}</Text>
            </View>
          </View>
        </View>

        <View className="mt-6 rounded-2xl bg-neutral-50 p-4">
          <Text className="text-sm font-semibold text-neutral-900">Next up</Text>
          <Text className="mt-1 text-xs text-neutral-600">Create recurring items in Planning to populate scheduled events for this account.</Text>
        </View>
      </View>
    </View>
  );
}
