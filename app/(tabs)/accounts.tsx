import React, { useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';

import { db } from '@/src/db/instant';
import type { Account, Transaction } from '@/src/db/types';
import { isWhatIfTxn } from '@/src/features/home/transactionFilters';
import { useAccounts } from '@/src/query/hooks/useAccounts';
import { useUserId } from '@/src/query/hooks/useUserId';
import { useAppStore } from '@/src/state/useAppStore';
import { addDays, toIsoDate } from '@/src/utils/dates';
import { newId } from '@/src/utils/uuid';
import { computeActualBalancesAsOf } from '@/src/utils/balances';

const ACCOUNT_COLORS = [
  '#2563eb', // blue
  '#16a34a', // green
  '#f97316', // orange
  '#db2777', // pink
  '#7c3aed', // violet
  '#0891b2', // cyan
  '#ca8a04', // amber
  '#0f766e', // teal
  '#4f46e5', // indigo
  '#dc2626', // red
];

function fallbackAccountColor(accountId: string): string {
  let h = 0;
  for (let i = 0; i < accountId.length; i++) h = (h * 31 + accountId.charCodeAt(i)) >>> 0;
  return ACCOUNT_COLORS[h % ACCOUNT_COLORS.length];
}

type AccountLite = {
  id: string;
  name?: string | null;
  type?: string | null;
  openingBalance?: number | null;
  color?: string | null;
};

function HeaderBar(props: { title: string; onAdd: () => void }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-lg font-semibold text-neutral-900">{props.title}</Text>
      <Pressable className="rounded-xl bg-emerald-600 px-3 py-2" onPress={props.onAdd}>
        <Text className="text-xs font-semibold text-white">Add</Text>
      </Pressable>
    </View>
  );
}

function ColorPickerRow(props: { value: string; onChange: (v: string) => void }) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {ACCOUNT_COLORS.map((c) => {
        const active = c.toLowerCase() === props.value.toLowerCase();
        return (
          <Pressable
            key={c}
            onPress={() => props.onChange(c)}
            className={active ? 'h-8 w-8 items-center justify-center rounded-full border-2 border-neutral-900' : 'h-8 w-8 rounded-full border border-neutral-200'}
          >
            <View className="h-6 w-6 rounded-full" style={{ backgroundColor: c }} />
          </Pressable>
        );
      })}
    </View>
  );
}

function AccountsList(props: {
  accounts: AccountLite[];
  balanceById: Record<string, number>;
  onOpenAccount: (id: string) => void;
  onLongPressAccount: (id: string) => void;
}) {
  return (
    <View className="flex-1 overflow-hidden rounded-t-3xl bg-white">
      <FlashList
        data={props.accounts}
        keyExtractor={(a) => a.id}
        ItemSeparatorComponent={() => <View className="h-px bg-neutral-100" />}
        ListEmptyComponent={() => (
          <View className="px-4 py-6">
            <Text className="text-sm text-neutral-500">No accounts yet. Add one to start planning.</Text>
          </View>
        )}
        renderItem={({ item }) => {
          const color = item.color ?? fallbackAccountColor(item.id);
          const bal = props.balanceById[item.id] ?? (item.openingBalance ?? 0);
          return (
            <Pressable
              className="flex-row items-center justify-between bg-white px-4 py-3"
              onPress={() => props.onOpenAccount(item.id)}
              onLongPress={() => props.onLongPressAccount(item.id)}
            >
              <View className="flex-row items-center gap-3 pr-4">
                <View className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
                <View className="pr-4">
                  <Text className="text-sm font-semibold text-neutral-900" numberOfLines={1}>
                    {item.name ?? 'Account'}
                  </Text>
                  <Text className="mt-0.5 text-xs text-neutral-500">{item.type ?? 'checking'}</Text>
                </View>
              </View>
              <View className="items-end">
                <Text className="text-sm font-semibold text-neutral-900">
                  {bal.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
                </Text>
                <Text className="mt-0.5 text-[11px] text-neutral-400">
                  Opening {(item.openingBalance ?? 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function CreateAccountModal(props: {
  open: boolean;
  canCreate: boolean;
  name: string;
  openingBalance: string;
  type: 'checking' | 'savings' | 'credit';
  color: string;
  setName: (v: string) => void;
  setOpeningBalance: (v: string) => void;
  setType: (v: 'checking' | 'savings' | 'credit') => void;
  setColor: (v: string) => void;
  onClose: () => void;
  onCreate: () => void;
}) {
  if (!props.open) return null;

  return (
    <View className="absolute inset-0 bg-black/30">
      <View className="mx-4 mt-24 rounded-2xl bg-white p-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-base font-semibold text-neutral-900">New account</Text>
          <Pressable onPress={props.onClose}>
            <Text className="text-sm font-semibold text-neutral-600">Close</Text>
          </Pressable>
        </View>

        <View className="mt-4">
          <Text className="mb-2 text-xs font-semibold text-neutral-700">Name</Text>
          <TextInput
            className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base"
            value={props.name}
            onChangeText={props.setName}
            placeholder="e.g. U.S. Bank Checking"
          />
        </View>

        <View className="mt-4">
          <Text className="mb-2 text-xs font-semibold text-neutral-700">Opening balance</Text>
          <TextInput
            className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base"
            value={props.openingBalance}
            onChangeText={props.setOpeningBalance}
            keyboardType="decimal-pad"
            placeholder="2295.96"
          />
        </View>

        <View className="mt-4">
          <Text className="mb-2 text-xs font-semibold text-neutral-700">Type</Text>
          <View className="flex-row gap-2">
            {(['checking', 'savings', 'credit'] as const).map((t) => (
              <Pressable
                key={t}
                className={t === props.type ? 'flex-1 rounded-xl bg-neutral-900 px-3 py-2' : 'flex-1 rounded-xl bg-neutral-100 px-3 py-2'}
                onPress={() => props.setType(t)}
              >
                <Text
                  className={
                    t === props.type
                      ? 'text-center text-[11px] font-semibold text-white'
                      : 'text-center text-[11px] font-semibold text-neutral-700'
                  }
                >
                  {t}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View className="mt-4">
          <Text className="mb-2 text-xs font-semibold text-neutral-700">Color</Text>
          <ColorPickerRow value={props.color} onChange={props.setColor} />
        </View>

        <Pressable
          className={`mt-5 h-12 items-center justify-center rounded-xl bg-emerald-600 ${!props.canCreate ? 'opacity-50' : 'active:opacity-90'}`}
          disabled={!props.canCreate}
          onPress={props.onCreate}
        >
          <Text className="text-base font-semibold text-white">Create</Text>
        </Pressable>

        <Pressable
          className="mt-3 items-center"
          onPress={() => {
            Alert.alert('Tip', 'Long-press an account in the list to make it the active account for Calendar.');
          }}
        >
          <Text className="text-xs font-semibold text-neutral-600">How selection works</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function AccountsScreen() {
  const router = useRouter();
  const userId = useUserId();
  const accountsQ = useAccounts();
  const accounts = useMemo(() => accountsQ.data ?? [], [accountsQ.data]);

  // Load all transactions for this user so we can compute a correct current balance.
  const instantTxns: any = db?.useQuery(
    (userId
      ? {
          transactions: {
            $: {
              where: {
                userId,
              },
            },
          },
        }
      : {}) as any
  );
  const txns = (instantTxns?.data?.transactions ?? []) as Transaction[];

  const balanceById = useMemo(() => {
    const asOf = `${toIsoDate(new Date())}T23:59:59.999Z`;
    return computeActualBalancesAsOf({ accounts: accounts as any as Account[], transactions: txns, asOfIsoDateTime: asOf });
  }, [accounts, txns]);

  const setSelectedAccountId = useAppStore((s) => s.setSelectedAccountId);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [type, setType] = useState<'checking' | 'savings' | 'credit'>('checking');
  const [color, setColor] = useState<string>(ACCOUNT_COLORS[0]);

  const canCreate = Boolean(db) && Boolean(userId) && Boolean(name.trim()) && Number.isFinite(Number(openingBalance));

  async function createAccount() {
    if (!db) return;
    if (!userId) {
      Alert.alert('Not signed in', 'Please sign in again to create an account.');
      return;
    }
    try {
      const id = newId();
      const opening = Number(openingBalance);
      if (!Number.isFinite(opening)) throw new Error('Opening balance must be a number');

      const acct = {
        id,
        userId,
        name: name.trim() || 'Account',
        type,
        currency: 'USD',
        openingBalance: opening,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        color,
      };

      await db.transact([db.tx.accounts[id].update(acct)]);
      setSelectedAccountId(id);
      setOpen(false);
      setName('');
      setOpeningBalance('0');
      setType('checking');
      setColor(ACCOUNT_COLORS[0]);
    } catch (e: any) {
      Alert.alert('Could not create account', e?.message ?? 'Unknown error');
    }
  }

  if (!db) {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-100 px-6">
        <Text className="text-base text-neutral-700">Connect InstantDB to manage accounts.</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-neutral-100">
      <View className="px-4 pb-3 pt-14">
        <HeaderBar
          title="Accounts"
          onAdd={() => {
            setColor(ACCOUNT_COLORS[accounts.length % ACCOUNT_COLORS.length]);
            setOpen(true);
          }}
        />
      </View>

      <AccountsList
        accounts={accounts as AccountLite[]}
        balanceById={balanceById}
        onOpenAccount={(id) => router.push(`/accounts/${id}`)}
        onLongPressAccount={(id) => setSelectedAccountId(id)}
      />

      <CreateAccountModal
        open={open}
        canCreate={canCreate}
        name={name}
        openingBalance={openingBalance}
        type={type}
        color={color}
        setName={setName}
        setOpeningBalance={setOpeningBalance}
        setType={setType}
        setColor={setColor}
        onClose={() => setOpen(false)}
        onCreate={createAccount}
      />
    </View>
  );
}
