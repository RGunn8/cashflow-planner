import React, { useMemo, useState } from 'react';
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
import { FlashList } from '@shopify/flash-list';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';

import { db } from '@/src/db/instant';
import type { Transaction } from '@/src/db/types';
import { bestMatch, candidatesForTransaction } from '@/src/features/matching/match';
import { isWhatIfTxn } from '@/src/features/home/transactionFilters';
import { VoiceAddModal, type VoiceParseResponse } from '@/src/features/voice/VoiceAddModal';
import { TagAutocompleteField } from '@/src/features/transactions/TagAutocompleteField';
import { useAccounts } from '@/src/query/hooks/useAccounts';
import { useScheduledEvents } from '@/src/query/hooks/useScheduledEvents';
import { useTransactionTags } from '@/src/query/hooks/useTransactionTags';
import { useUserId } from '@/src/query/hooks/useUserId';
import { useAppStore } from '@/src/state/useAppStore';
import { addDays, parseIsoDate, toIsoDate } from '@/src/utils/dates';
import { newId } from '@/src/utils/uuid';

function HeaderBar(props: { title: string; subtitle: string; onAdd: () => void; onVoice: () => void }) {
  return (
    <View className="flex-row items-center justify-between">
      <View>
        <Text className="text-lg font-semibold text-neutral-900">{props.title}</Text>
        <Text className="mt-1 text-xs text-neutral-500">{props.subtitle}</Text>
      </View>
      <View className="flex-row gap-2">
        <Pressable className="rounded-xl bg-neutral-900 px-3 py-2" onPress={props.onVoice}>
          <Text className="text-xs font-semibold text-white">Voice</Text>
        </Pressable>
        <Pressable className="rounded-xl bg-emerald-600 px-3 py-2" onPress={props.onAdd}>
          <Text className="text-xs font-semibold text-white">Add txn</Text>
        </Pressable>
      </View>
    </View>
  );
}

function TransactionsList(props: { txns: any[]; onMatch: (id: string) => void }) {
  return (
    <View className="flex-1 overflow-hidden rounded-t-3xl bg-white">
      <FlashList
        data={props.txns}
        keyExtractor={(t) => t.id}
        ItemSeparatorComponent={() => <View className="h-px bg-neutral-100" />}
        ListEmptyComponent={() => (
          <View className="px-4 py-6">
            <Text className="text-sm text-neutral-500">No transactions yet. Add one to test matching.</Text>
          </View>
        )}
        renderItem={({ item }) => {
          const isWhatIf = isWhatIfTxn(item as Transaction);
          const matched = item.matchStatus === 'matched' && item.matchedEventId;
          const tags = Array.isArray(item.tags) ? (item.tags as string[]) : [];
          const statusLabel = isWhatIf ? 'What-if' : matched ? 'Matched' : 'Needs review';
          return (
            <View className="flex-row items-center justify-between bg-white px-4 py-3">
              <View className="flex-1 pr-3">
                <Text className="text-sm font-semibold text-neutral-900" numberOfLines={1}>
                  {item.description || 'Transaction'}
                </Text>
                <Text className="mt-0.5 text-xs text-neutral-500">
                  {item.postedAt.slice(0, 10)} • {statusLabel}
                  {tags.length ? ` • ${tags.join(', ')}` : ''}
                </Text>
              </View>
              <View className="items-end">
                <Text className={item.amount >= 0 ? 'text-sm font-semibold text-emerald-700' : 'text-sm font-semibold text-rose-700'}>
                  {item.amount.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
                </Text>
                {!matched && !isWhatIf ? (
                  <Pressable className="mt-1 rounded-xl bg-neutral-900 px-3 py-1.5" onPress={() => props.onMatch(item.id)}>
                    <Text className="text-[11px] font-semibold text-white">Match</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        }}
      />
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

function MatchModal(props: {
  open: boolean;
  txn: any | null;
  candidates: any[];
  onClose: () => void;
  onPick: (eventId: string) => void;
}) {
  if (!props.open || !props.txn) return null;
  return (
    <View className="absolute inset-0 bg-black/30">
      <View className="mx-4 mt-20 max-h-[70%] rounded-2xl bg-white p-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-base font-semibold text-neutral-900">Match transaction</Text>
          <Pressable onPress={props.onClose}>
            <Text className="text-sm font-semibold text-neutral-600">Close</Text>
          </Pressable>
        </View>
        <Text className="mt-2 text-xs text-neutral-500">
          {props.txn.description} • {props.txn.amount.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
        </Text>

        <View className="mt-4 overflow-hidden rounded-xl border border-neutral-100">
          <FlashList
            data={props.candidates.slice(0, 20)}
            keyExtractor={(c) => c.event.id}
            ItemSeparatorComponent={() => <View className="h-px bg-neutral-100" />}
            ListEmptyComponent={() => (
              <View className="px-4 py-6">
                <Text className="text-sm text-neutral-500">No candidates found (try adding scheduled events in Planning).</Text>
              </View>
            )}
            renderItem={({ item }) => (
              <Pressable className="bg-white px-4 py-3" onPress={() => props.onPick(item.event.id)}>
                <Text className="text-sm font-semibold text-neutral-900">
                  {item.event.kind} • {item.event.date}
                </Text>
                <Text className="mt-0.5 text-xs text-neutral-500">
                  {item.event.amount.toLocaleString(undefined, { style: 'currency', currency: 'USD' })} • score {item.score}
                </Text>
              </Pressable>
            )}
          />
        </View>
      </View>
    </View>
  );
}

export default function ActivityScreen() {
  const router = useRouter();
  const userId = useUserId();
  const accountsQ = useAccounts();
  const accounts = accountsQ.data ?? [];

  const setPendingRecurringDraft = useAppStore((s) => s.setPendingRecurringDraft);

  const today = toIsoDate(new Date());
  const fromDay = addDays(today, -365);
  const toDay = today;
  const rangeKey = `${fromDay}_${toDay}`;

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

  const eventsQ = useScheduledEvents({ rangeKey, from: fromDay, to: toDay });

  const [open, setOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [tags, setTags] = useState('');
  const [accountId, setAccountId] = useState<string | null>(accounts[0]?.id ?? null);

  const [matchTxnId, setMatchTxnId] = useState<string | null>(null);

  const matchTxn = useMemo(() => txnsInRange.find((t) => t.id === matchTxnId) ?? null, [matchTxnId, txnsInRange]);
  const candidates = useMemo(() => {
    if (!matchTxn) return [];
    return candidatesForTransaction({ txn: matchTxn, events: eventsQ.data ?? [] });
  }, [eventsQ.data, matchTxn]);

  const tagsQ = useTransactionTags();
  const knownTags = tagsQ.data ?? [];

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
        matchStatus: 'needs_review',
      };

      const maybe = bestMatch({ txn: txn as any, events: (eventsQ.data ?? []) as any });

      const txs: any[] = [db.tx.transactions[id].update(txn)];
      if (maybe) {
        txs.push(db.tx.transactions[id].update({ matchStatus: 'matched', matchedEventId: maybe.id }));
        txs.push(db.tx.scheduledEvents[maybe.id].update({ status: 'matched' }));
      }

      await db.transact(txs);
      setDate(today);
      setDesc('');
      setAmount('');
      setTags('');
      setOpen(false);
    } catch (e: any) {
      Alert.alert('Could not add transaction', e?.message ?? 'Unknown error');
    }
  }

  async function manualMatch(eventId: string) {
    if (!db || !matchTxn) return;
    try {
      await db.transact([
        db.tx.transactions[matchTxn.id].update({ matchStatus: 'matched', matchedEventId: eventId }),
        db.tx.scheduledEvents[eventId].update({ status: 'matched' }),
      ]);
      setMatchTxnId(null);
    } catch (e: any) {
      Alert.alert('Could not match', e?.message ?? 'Unknown error');
    }
  }

  function handleVoiceResult(res: VoiceParseResponse) {
    if (res.intent === 'transaction' && res.transaction) {
      if (res.transaction.date) setDate(res.transaction.date);
      if (typeof res.transaction.amount === 'number') setAmount(String(res.transaction.amount));
      if (res.transaction.description) setDesc(res.transaction.description);
      if (Array.isArray(res.transaction.tags)) setTags(res.transaction.tags.join(', '));
      if (res.transaction.accountId) setAccountId(res.transaction.accountId);
      setOpen(true);
      return;
    }

    if (res.intent === 'recurring' && res.recurring) {
      setPendingRecurringDraft(res.recurring as any);
      router.push('/(tabs)/planning');
      return;
    }

    Alert.alert('Could not understand', res.transcript || 'Try again.');
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
          onVoice={() => setVoiceOpen(true)}
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
      </View>

      <TransactionsList
        txns={txnsInRange.slice().sort((a, b) => ((a.postedAt ?? '') < (b.postedAt ?? '') ? 1 : -1))}
        onMatch={(id) => setMatchTxnId(id)}
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

      <VoiceAddModal open={voiceOpen} onClose={() => setVoiceOpen(false)} onResult={handleVoiceResult} />

      <MatchModal open={Boolean(matchTxn)} txn={matchTxn} candidates={candidates} onClose={() => setMatchTxnId(null)} onPick={(eventId) => manualMatch(eventId)} />
    </View>
  );
}
