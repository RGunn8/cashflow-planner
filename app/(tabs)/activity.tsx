import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { db } from '@/src/db/instant';
import type { Transaction } from '@/src/db/types';
import { BulkAddModal, type BulkAddSaveParams, type BulkSaveRow } from '@/src/features/transactions/BulkAddModal';
import { TagAutocompleteField } from '@/src/features/transactions/TagAutocompleteField';
import {
  collectTagsFromTransactions,
  filterTransactions,
  sortTransactionsDateDesc,
} from '@/src/features/transactions/transactionFilter';
import { TransactionSearchFilters } from '@/src/features/transactions/TransactionSearchFilters';
import { TransactionsFlashList } from '@/src/features/transactions/TransactionsFlashList';
import { useAccounts } from '@/src/query/hooks/useAccounts';
import { useTransactionTags } from '@/src/query/hooks/useTransactionTags';
import { useUserId } from '@/src/query/hooks/useUserId';
import { addDays, parseIsoDate, toIsoDate } from '@/src/utils/dates';
import { newId } from '@/src/utils/uuid';

function HeaderBar(props: { title: string; subtitle: string; onAdd: () => void; onBulkAdd: () => void }) {
  return (
    <View className="flex-row items-center justify-between">
      <View>
        <Text className="text-lg font-semibold text-neutral-900">{props.title}</Text>
        <Text className="mt-1 text-xs text-neutral-500">{props.subtitle}</Text>
      </View>
      <View className="flex-row gap-2">
        <Pressable className="rounded-xl bg-neutral-900 px-3 py-2" onPress={props.onBulkAdd}>
          <Text className="text-xs font-semibold text-white">Bulk add</Text>
        </Pressable>
        <Pressable className="rounded-xl bg-emerald-600 px-3 py-2" onPress={props.onAdd}>
          <Text className="text-xs font-semibold text-white">Add txn</Text>
        </Pressable>
      </View>
    </View>
  );
}

function AddTransactionModal(props: {
  open: boolean;
  accounts: any[];
  date: string;
  desc: string;
  amount: string;
  tags: string;
  knownTags: string[];
  accountId: string | null;
  setDate: (v: string) => void;
  setDesc: (v: string) => void;
  setAmount: (v: string) => void;
  setTags: (v: string) => void;
  setAccountId: (v: string) => void;
  onClose: () => void;
  onAdd: () => void;
}) {
  if (!props.open) return null;
  const [dateOpen, setDateOpen] = useState(false);

  const dateValue = useMemo(() => {
    const s = props.date?.trim?.() ?? '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return parseIsoDate(s);
    return new Date();
  }, [props.date]);

  function onPickDate(e: DateTimePickerEvent, d?: Date) {
    if (e.type !== 'set' || !d) {
      setDateOpen(false);
      return;
    }
    props.setDate(toIsoDate(d));
    setDateOpen(false);
  }

  return (
    <View className="absolute inset-0 bg-black/30">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="mx-4 mt-24 rounded-2xl bg-white p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-semibold text-neutral-900">New transaction</Text>
              <Pressable onPress={props.onClose}>
                <Text className="text-sm font-semibold text-neutral-600">Close</Text>
              </Pressable>
            </View>

            <View className="mt-4">
              <Text className="mb-2 text-xs font-semibold text-neutral-700">Description</Text>
              <TextInput
                className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base"
                value={props.desc}
                onChangeText={props.setDesc}
                placeholder="e.g. Rent payment"
              />
            </View>

            <View className="mt-4">
              <Text className="mb-2 text-xs font-semibold text-neutral-700">Date</Text>
              {Platform.OS === 'web' ? (
                <TextInput
                  className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base"
                  value={props.date}
                  onChangeText={props.setDate}
                  placeholder="YYYY-MM-DD"
                />
              ) : (
                <Pressable
                  className="flex-row items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3"
                  onPress={() => setDateOpen(true)}
                >
                  <Text className="text-base text-neutral-900">{props.date}</Text>
                  <Text className="text-xs font-semibold text-emerald-700">Pick</Text>
                </Pressable>
              )}
              {dateOpen && Platform.OS !== 'web' ? (
                <View className="mt-2 overflow-hidden rounded-xl border border-neutral-200 bg-white">
                  <DateTimePicker value={dateValue} mode="date" onChange={onPickDate} />
                </View>
              ) : null}
            </View>

            <View className="mt-4">
              <Text className="mb-2 text-xs font-semibold text-neutral-700">Amount (negative for spend)</Text>
              <TextInput
                className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base"
                value={props.amount}
                onChangeText={props.setAmount}
                keyboardType="decimal-pad"
                placeholder="-1200"
              />
            </View>

            <View className="mt-4">
              <Text className="mb-2 text-xs font-semibold text-neutral-700">Tags (comma separated)</Text>
              <TagAutocompleteField value={props.tags} onChangeText={props.setTags} knownTags={props.knownTags} />
            </View>

            <View className="mt-4">
              <Text className="mb-2 text-xs font-semibold text-neutral-700">Account</Text>
              <View className="flex-row flex-wrap gap-2">
                {props.accounts.map((a) => (
                  <Pressable
                    key={a.id}
                    className={a.id === props.accountId ? 'rounded-xl bg-neutral-900 px-3 py-2' : 'rounded-xl bg-neutral-100 px-3 py-2'}
                    onPress={() => props.setAccountId(a.id)}
                  >
                    <Text className={a.id === props.accountId ? 'text-xs font-semibold text-white' : 'text-xs font-semibold text-neutral-700'}>
                      {a.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <Pressable className="mt-5 h-12 items-center justify-center rounded-xl bg-emerald-600" onPress={props.onAdd}>
              <Text className="text-base font-semibold text-white">Add</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

export default function ActivityScreen() {
  const userId = useUserId();
  const accountsQ = useAccounts();
  const accounts = accountsQ.data ?? [];

  const today = toIsoDate(new Date());
  const fromDay = addDays(today, -365);
  const toDay = today;

  // Query all transactions for the user and filter client-side.
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

  const txnsAll = (instantTxns?.data?.transactions ?? []) as Transaction[];
  const txnsInRange = useMemo(() => {
    const from = `${fromDay}T00:00:00.000Z`;
    const to = `${toDay}T23:59:59.999Z`;
    return txnsAll.filter((t) => (t.postedAt ?? '') >= from && (t.postedAt ?? '') <= to);
  }, [fromDay, toDay, txnsAll]);

  const [open, setOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [tags, setTags] = useState('');
  const [accountId, setAccountId] = useState<string | null>(accounts[0]?.id ?? null);

  const tagsQ = useTransactionTags();
  const knownTags = tagsQ.data ?? [];

  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(() => new Set());

  const tagOptionsInRange = useMemo(() => collectTagsFromTransactions(txnsInRange), [txnsInRange]);

  const filteredSorted = useMemo(() => {
    const filtered = filterTransactions(txnsInRange, search, selectedTags);
    return filtered.slice().sort(sortTransactionsDateDesc);
  }, [txnsInRange, search, selectedTags]);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }, []);

  async function addTransaction() {
    if (!db || !userId || !accountId) return;
    try {
      const id = newId();
      const dateTrim = date.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateTrim)) throw new Error('Date must be YYYY-MM-DD');
      const postedAt = `${dateTrim}T12:00:00.000Z`;
      const amt = Number(amount);
      if (!Number.isFinite(amt)) throw new Error('Amount must be a number');

      const txn = {
        id,
        userId,
        accountId,
        postedAt,
        amount: amt,
        description: desc.trim() || 'Transaction',
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      };

      await db.transact([db.tx.transactions[id].update(txn)]);
      setDate(today);
      setDesc('');
      setAmount('');
      setTags('');
      setOpen(false);
    } catch (e: any) {
      Alert.alert('Could not add transaction', e?.message ?? 'Unknown error');
    }
  }

  async function handleBulkSave(params: BulkAddSaveParams) {
    if (params.mode !== 'transactions') return;
    await saveBulkTransactions({
      defaultDate: params.defaultDate,
      accountId: params.accountId,
      rows: params.rows,
    });
  }

  async function saveBulkTransactions(params: { defaultDate: string; accountId: string; rows: BulkSaveRow[] }) {
    const client = db;
    if (!client || !userId) return;
    try {
      const defaultDay = params.defaultDate.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(defaultDay)) throw new Error('Date must be YYYY-MM-DD');

      const txs = params.rows.map((row) => {
        const id = newId();
        const day =
          row.date && /^\d{4}-\d{2}-\d{2}$/.test(row.date.trim()) ? row.date.trim() : defaultDay;
        const postedAt = `${day}T12:00:00.000Z`;
        return client.tx.transactions[id].update({
          userId,
          accountId: params.accountId,
          postedAt,
          amount: row.amount,
          description: row.description.trim() || 'Transaction',
          tags: [],
        });
      });
      await client.transact(txs);
    } catch (e: any) {
      Alert.alert('Could not add transactions', e?.message ?? 'Unknown error');
      throw e;
    }
  }

  if (!db) {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-100 px-6">
        <Text className="text-base text-neutral-700">Connect InstantDB to view Activity.</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-neutral-100">
      <View className="px-4 pb-3 pt-14">
        <HeaderBar
          title="Activity"
          subtitle="Last 12 months"
          onBulkAdd={() => {
            if (!accounts.length) {
              Alert.alert('Create an account first', 'Add an account in the Accounts tab.');
              return;
            }
            setAccountId(accounts[0].id);
            setBulkOpen(true);
          }}
          onAdd={() => {
            if (!accounts.length) {
              Alert.alert('Create an account first', 'Add an account in the Accounts tab.');
              return;
            }
            setDate(today);
            setAccountId(accounts[0].id);
            setOpen(true);
          }}
        />
        <View className="mt-4">
          <TransactionSearchFilters
            search={search}
            onSearchChange={setSearch}
            tagOptions={tagOptionsInRange}
            selectedTags={selectedTags}
            toggleTag={toggleTag}
          />
          {filteredSorted.length !== txnsInRange.length ? (
            <Text className="mt-2 text-[11px] text-neutral-500">
              Showing {filteredSorted.length} of {txnsInRange.length}
            </Text>
          ) : null}
        </View>
      </View>

      <TransactionsFlashList
        txns={filteredSorted}
        emptyHint={
          txnsInRange.length === 0
            ? 'No transactions yet. Add one from here or the home screen.'
            : 'No transactions match your search or tags. Clear filters to see more.'
        }
        onDelete={(txn) => {
          Alert.alert('Delete transaction?', txn.description || 'Transaction', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                if (!db) return;
                try {
                  await db.transact([db.tx.transactions[txn.id].delete()]);
                } catch (e: any) {
                  Alert.alert('Could not delete', e?.message ?? 'Unknown error');
                }
              },
            },
          ]);
        }}
      />

      <AddTransactionModal
        open={open}
        accounts={accounts}
        date={date}
        desc={desc}
        amount={amount}
        tags={tags}
        knownTags={knownTags}
        accountId={accountId}
        setDate={setDate}
        setDesc={setDesc}
        setAmount={setAmount}
        setTags={setTags}
        setAccountId={(id) => setAccountId(id)}
        onClose={() => setOpen(false)}
        onAdd={addTransaction}
      />

      <BulkAddModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        accounts={accounts}
        accountId={accountId}
        setAccountId={(id) => setAccountId(id)}
        defaultDate={today}
        onSave={handleBulkSave}
      />
    </View>
  );
}
