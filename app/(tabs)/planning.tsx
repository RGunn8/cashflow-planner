import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Dimensions, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';

import { db } from '@/src/db/instant';
import { materializeScheduledEvents } from '@/src/features/planning/materialize';
import { BulkAddModal, type BulkAddSaveParams } from '@/src/features/transactions/BulkAddModal';
import { useAccounts } from '@/src/query/hooks/useAccounts';
import { useGoals } from '@/src/query/hooks/useGoals';
import { useRecurringRules } from '@/src/query/hooks/useRecurringRules';
import { useUserId } from '@/src/query/hooks/useUserId';
import { useAppStore } from '@/src/state/useAppStore';
import { parseIsoDate, toIsoDate } from '@/src/utils/dates';
import { newId } from '@/src/utils/uuid';
import { formatUsd } from '@/src/utils/money';

type Kind = 'income' | 'bill' | 'transfer';
type Cadence = 'weekly' | 'biweekly' | 'monthly';

function HeaderBar(props: { title: string; onAdd: () => void; onBulkAddBills: () => void }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-lg font-semibold text-neutral-900">{props.title}</Text>
      <View className="flex-row gap-2">
        <Pressable className="rounded-xl bg-neutral-900 px-3 py-2" onPress={props.onBulkAddBills}>
          <Text className="text-xs font-semibold text-white">Bulk bills</Text>
        </Pressable>
        <Pressable className="rounded-xl bg-emerald-600 px-3 py-2" onPress={props.onAdd}>
          <Text className="text-xs font-semibold text-white">Add</Text>
        </Pressable>
      </View>
    </View>
  );
}

function RuleRow(props: { rule: any; amountClass: string; amountText: string }) {
  return (
    <View className="flex-row items-center justify-between bg-white px-4 py-3">
      <View className="flex-1 pr-4">
        <Text className="text-sm font-semibold text-neutral-900" numberOfLines={1}>
          {props.rule.name}
        </Text>
        <Text className="mt-0.5 text-xs text-neutral-500">
          {props.rule.cadence} • next {props.rule.nextRunAt}
        </Text>
      </View>
      <Text className={props.amountClass}>{props.amountText}</Text>
    </View>
  );
}

type PlanSortKey = 'date' | 'amount';

function PlanSortBar(props: { sortBy: PlanSortKey; onSortBy: (k: PlanSortKey) => void }) {
  function Opt({ label, k }: { label: string; k: PlanSortKey }) {
    const active = props.sortBy === k;
    return (
      <Pressable
        className={active ? 'rounded-lg bg-neutral-900 px-2.5 py-1.5' : 'rounded-lg bg-neutral-100 px-2.5 py-1.5'}
        onPress={() => props.onSortBy(k)}
      >
        <Text className={active ? 'text-xs font-semibold text-white' : 'text-xs font-semibold text-neutral-600'}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <View className="flex-row flex-wrap items-center gap-2 border-b border-neutral-100 bg-white px-4 py-3">
      <Text className="text-xs font-semibold text-neutral-500">Sort</Text>
      <Opt label="Date" k="date" />
      <Opt label="Amount" k="amount" />
    </View>
  );
}

function compareRecurringRules(a: any, b: any, sortBy: PlanSortKey): number {
  if (sortBy === 'amount') {
    return Math.abs(Number(b.amount ?? 0)) - Math.abs(Number(a.amount ?? 0));
  }
  return String(a.nextRunAt ?? '').localeCompare(String(b.nextRunAt ?? ''));
}

function compareGoals(a: any, b: any, sortBy: PlanSortKey): number {
  if (sortBy === 'amount') {
    return Number(b.targetAmount ?? 0) - Number(a.targetAmount ?? 0);
  }
  return String(a.targetDate ?? '').localeCompare(String(b.targetDate ?? ''));
}

function RulesSection(props: { title: string; emptyText: string; children?: React.ReactNode }) {
  return (
    <View>
      <View className="bg-neutral-50 px-4 py-2">
        <Text className="text-xs font-semibold text-neutral-600">{props.title}</Text>
      </View>
      {props.children ? (
        props.children
      ) : (
        <View className="bg-white px-4 py-4">
          <Text className="text-sm text-neutral-500">{props.emptyText}</Text>
        </View>
      )}
    </View>
  );
}

function CreateRuleModal(props: {
  open: boolean;
  canCreate: boolean;
  kind: Kind;
  name: string;
  amount: string;
  cadence: Cadence;
  weeklyDow: number;
  monthlyDay: number;
  accountId: string | null;
  toAccountId: string | null;
  accounts: any[];
  setKind: (v: Kind) => void;
  setName: (v: string) => void;
  setAmount: (v: string) => void;
  setCadence: (v: Cadence) => void;
  setWeeklyDow: (v: number) => void;
  setMonthlyDay: (v: number) => void;
  setAccountId: (v: string) => void;
  setToAccountId: (v: string) => void;
  onClose: () => void;
  onCreate: () => void;
}) {
  if (!props.open) return null;
  const maxHeight = Math.min(Dimensions.get('window').height * 0.8, 640);
  return (
    <View className="absolute inset-0 bg-black/30 px-4">
      <KeyboardAvoidingView
        className="flex-1 items-center justify-center"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <View className="w-full max-w-[480px] overflow-hidden rounded-2xl bg-white">
          <ScrollView style={{ maxHeight }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-semibold text-neutral-900">New recurring</Text>
              <Pressable onPress={props.onClose}>
                <Text className="text-sm font-semibold text-neutral-600">Close</Text>
              </Pressable>
            </View>

            <View className="mt-4 flex-row gap-2">
              {(['bill', 'income', 'transfer'] as Kind[]).map((k) => (
                <Pressable
                  key={k}
                  className={k === props.kind ? 'flex-1 rounded-xl bg-emerald-600 px-3 py-2' : 'flex-1 rounded-xl bg-neutral-100 px-3 py-2'}
                  onPress={() => props.setKind(k)}
                >
                  <Text
                    className={k === props.kind ? 'text-center text-xs font-semibold text-white' : 'text-center text-xs font-semibold text-neutral-700'}
                  >
                    {k === 'bill' ? 'Bill' : k === 'income' ? 'Income' : 'Transfer'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View className="mt-4">
              <Text className="mb-2 text-xs font-semibold text-neutral-700">Name</Text>
              <TextInput
                className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base"
                value={props.name}
                onChangeText={props.setName}
                placeholder="e.g. Rent"
              />
            </View>

            <View className="mt-4">
              <Text className="mb-2 text-xs font-semibold text-neutral-700">Amount</Text>
              <TextInput
                className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base"
                value={props.amount}
                onChangeText={props.setAmount}
                keyboardType="decimal-pad"
                placeholder="1200"
              />
            </View>

            <View className="mt-4">
              <Text className="mb-2 text-xs font-semibold text-neutral-700">Cadence</Text>
              <View className="flex-row gap-2">
                {(['weekly', 'biweekly', 'monthly'] as Cadence[]).map((c) => (
                  <Pressable
                    key={c}
                    className={c === props.cadence ? 'flex-1 rounded-xl bg-neutral-900 px-3 py-2' : 'flex-1 rounded-xl bg-neutral-100 px-3 py-2'}
                    onPress={() => props.setCadence(c)}
                  >
                    <Text
                      className={
                        c === props.cadence ? 'text-center text-xs font-semibold text-white' : 'text-center text-xs font-semibold text-neutral-700'
                      }
                    >
                      {c}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {props.cadence === 'weekly' || props.cadence === 'biweekly' ? (
              <View className="mt-4">
                <Text className="mb-2 text-xs font-semibold text-neutral-700">Day of week</Text>
                <View className="flex-row flex-wrap gap-2">
                  {(
                    [
                      { dow: 1, label: 'Mon' },
                      { dow: 2, label: 'Tue' },
                      { dow: 3, label: 'Wed' },
                      { dow: 4, label: 'Thu' },
                      { dow: 5, label: 'Fri' },
                      { dow: 6, label: 'Sat' },
                      { dow: 0, label: 'Sun' },
                    ] as const
                  ).map((d) => (
                    <Pressable
                      key={d.dow}
                      className={d.dow === props.weeklyDow ? 'rounded-xl bg-neutral-900 px-3 py-2' : 'rounded-xl bg-neutral-100 px-3 py-2'}
                      onPress={() => props.setWeeklyDow(d.dow)}
                    >
                      <Text className={d.dow === props.weeklyDow ? 'text-xs font-semibold text-white' : 'text-xs font-semibold text-neutral-700'}>
                        {d.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {props.cadence === 'monthly' ? (
              <View className="mt-4">
                <Text className="mb-2 text-xs font-semibold text-neutral-700">Day of month</Text>
                <View className="flex-row flex-wrap gap-2">
                  {[1, 5, 10, 15, 20, 25, 28, 30, 31].map((d) => (
                    <Pressable
                      key={d}
                      className={d === props.monthlyDay ? 'rounded-xl bg-neutral-900 px-3 py-2' : 'rounded-xl bg-neutral-100 px-3 py-2'}
                      onPress={() => props.setMonthlyDay(d)}
                    >
                      <Text className={d === props.monthlyDay ? 'text-xs font-semibold text-white' : 'text-xs font-semibold text-neutral-700'}>{d}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text className="mt-2 text-xs text-neutral-500">For shorter months, we’ll automatically use the last valid day.</Text>
              </View>
            ) : null}

            <View className="mt-4">
              <Text className="mb-2 text-xs font-semibold text-neutral-700">
                {props.kind === 'transfer' ? 'From account' : 'Account'}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {props.accounts.map((a) => (
                  <Pressable
                    key={a.id}
                    className={a.id === props.accountId ? 'rounded-xl bg-neutral-900 px-3 py-2' : 'rounded-xl bg-neutral-100 px-3 py-2'}
                    onPress={() => props.setAccountId(a.id)}
                  >
                    <Text className={a.id === props.accountId ? 'text-xs font-semibold text-white' : 'text-xs font-semibold text-neutral-700'}>{a.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {props.kind === 'transfer' ? (
              <View className="mt-4">
                <Text className="mb-2 text-xs font-semibold text-neutral-700">To account</Text>
                <View className="flex-row flex-wrap gap-2">
                  {props.accounts
                    .filter((a) => a.id !== props.accountId)
                    .map((a) => (
                      <Pressable
                        key={a.id}
                        className={a.id === props.toAccountId ? 'rounded-xl bg-neutral-900 px-3 py-2' : 'rounded-xl bg-neutral-100 px-3 py-2'}
                        onPress={() => props.setToAccountId(a.id)}
                      >
                        <Text
                          className={a.id === props.toAccountId ? 'text-xs font-semibold text-white' : 'text-xs font-semibold text-neutral-700'}
                        >
                          {a.name}
                        </Text>
                      </Pressable>
                    ))}
                </View>
                {props.accounts.length < 2 ? (
                  <Text className="mt-2 text-xs text-neutral-500">Add a second account to enable transfers.</Text>
                ) : null}
              </View>
            ) : null}

            <Pressable
              className={`mt-5 h-12 items-center justify-center rounded-xl bg-emerald-600 ${!props.canCreate ? 'opacity-50' : 'active:opacity-90'}`}
              disabled={!props.canCreate}
              onPress={props.onCreate}
            >
              <Text className="text-base font-semibold text-white">Create</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function toIsoDateUTC(d: Date): string {
  // Using UTC keeps behavior stable across timezones and matches existing `toIsoDate` usage elsewhere.
  return toIsoDate(d);
}

function startOfTodayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function nextWeekdayFromTodayUTC(targetDow: number): string {
  const base = startOfTodayUTC();
  const todayDow = base.getUTCDay(); // 0..6 (Sun..Sat)
  const delta = (targetDow - todayDow + 7) % 7; // 0..6
  base.setUTCDate(base.getUTCDate() + delta);
  return toIsoDateUTC(base);
}

function nextMonthDayFromTodayUTC(dayOfMonth: number): string {
  const base = startOfTodayUTC();
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth();
  const today = base.getUTCDate();

  // Clamp to the number of days in the target month.
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const clamped = Math.max(1, Math.min(dayOfMonth, daysInMonth));

  if (today <= clamped) {
    return toIsoDateUTC(new Date(Date.UTC(y, m, clamped)));
  }

  // Otherwise, pick the day in next month (also clamped).
  const y2 = m === 11 ? y + 1 : y;
  const m2 = (m + 1) % 12;
  const daysInNext = new Date(Date.UTC(y2, m2 + 1, 0)).getUTCDate();
  const clamped2 = Math.max(1, Math.min(dayOfMonth, daysInNext));
  return toIsoDateUTC(new Date(Date.UTC(y2, m2, clamped2)));
}

function GoalRow(props: { goal: any; onOpen: (id: string) => void }) {
  return (
    <Pressable className="flex-row items-center justify-between bg-white px-4 py-3" onPress={() => props.onOpen(props.goal.id)}>
      <View className="flex-1 pr-4">
        <Text className="text-sm font-semibold text-neutral-900" numberOfLines={1}>
          {props.goal.name}
        </Text>
        <Text className="mt-0.5 text-xs text-neutral-500">Target {props.goal.targetDate}</Text>
      </View>
      <Text className="text-sm font-semibold text-amber-700">{formatUsd(props.goal.targetAmount)}</Text>
    </Pressable>
  );
}

function CreateGoalModal(props: {
  open: boolean;
  name: string;
  targetAmount: string;
  targetDate: string;
  startingBalance: string;
  fundingAccountId: string | null;
  fundingAmount: string;
  accounts: { id: string; name?: string | null }[];
  setName: (v: string) => void;
  setTargetAmount: (v: string) => void;
  setTargetDate: (v: string) => void;
  setStartingBalance: (v: string) => void;
  setFundingAccountId: (id: string | null) => void;
  setFundingAmount: (v: string) => void;
  onClose: () => void;
  onCreate: () => void;
}) {
  if (!props.open) return null;
  const [dateOpen, setDateOpen] = useState(false);
  const dateValue = useMemo(() => {
    const s = props.targetDate?.trim?.() ?? '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return parseIsoDate(s);
    return new Date();
  }, [props.targetDate]);

  function onPickDate(e: DateTimePickerEvent, d?: Date) {
    if (e.type !== 'set' || !d) {
      setDateOpen(false);
      return;
    }
    props.setTargetDate(toIsoDate(d));
    setDateOpen(false);
  }

  const maxHeight = Math.min(Dimensions.get('window').height * 0.8, 640);
  return (
    <View className="absolute inset-0 bg-black/30 px-4">
      <KeyboardAvoidingView
        className="flex-1 items-center justify-center"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <View className="w-full max-w-[480px] overflow-hidden rounded-2xl bg-white">
          <ScrollView style={{ maxHeight }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-semibold text-neutral-900">New goal</Text>
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
                placeholder="e.g. Emergency Fund"
              />
            </View>

            <View className="mt-4">
              <Text className="mb-2 text-xs font-semibold text-neutral-700">Target amount</Text>
              <TextInput
                className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base"
                value={props.targetAmount}
                onChangeText={props.setTargetAmount}
                keyboardType="decimal-pad"
                placeholder="5000"
              />
            </View>

            <View className="mt-4">
              <Text className="mb-2 text-xs font-semibold text-neutral-700">Target date</Text>
              {Platform.OS === 'web' ? (
                <TextInput
                  className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base"
                  value={props.targetDate}
                  onChangeText={props.setTargetDate}
                  placeholder="YYYY-MM-DD"
                />
              ) : (
                <Pressable
                  className="flex-row items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3"
                  onPress={() => setDateOpen(true)}
                >
                  <Text className="text-base text-neutral-900">{props.targetDate}</Text>
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
              <Text className="mb-2 text-xs font-semibold text-neutral-700">Starting balance (optional)</Text>
              <TextInput
                className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base"
                value={props.startingBalance}
                onChangeText={props.setStartingBalance}
                keyboardType="decimal-pad"
                placeholder="0"
              />
            </View>

            <View className="mt-4">
              <Text className="mb-2 text-xs font-semibold text-neutral-700">Funding account (optional)</Text>
              <View className="flex-row flex-wrap gap-2">
                <Pressable
                  className={!props.fundingAccountId ? 'rounded-xl bg-neutral-900 px-3 py-2' : 'rounded-xl bg-neutral-100 px-3 py-2'}
                  onPress={() => props.setFundingAccountId(null)}
                >
                  <Text className={!props.fundingAccountId ? 'text-xs font-semibold text-white' : 'text-xs font-semibold text-neutral-700'}>
                    None
                  </Text>
                </Pressable>
                {props.accounts.map((a) => (
                  <Pressable
                    key={a.id}
                    className={a.id === props.fundingAccountId ? 'rounded-xl bg-neutral-900 px-3 py-2' : 'rounded-xl bg-neutral-100 px-3 py-2'}
                    onPress={() => props.setFundingAccountId(a.id)}
                  >
                    <Text className={a.id === props.fundingAccountId ? 'text-xs font-semibold text-white' : 'text-xs font-semibold text-neutral-700'}>
                      {a.name ?? 'Account'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {props.fundingAccountId ? (
              <View className="mt-4">
                <Text className="mb-2 text-xs font-semibold text-neutral-700">Funding amount</Text>
                <TextInput
                  className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base"
                  value={props.fundingAmount}
                  onChangeText={props.setFundingAmount}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 500"
                />
                <Text className="mt-1 text-xs text-neutral-500">Leave blank to use full balance.</Text>
              </View>
            ) : null}

            <Pressable className="mt-5 h-12 items-center justify-center rounded-xl bg-emerald-600" onPress={props.onCreate}>
              <Text className="text-base font-semibold text-white">Create</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

export default function PlanningScreen() {
  const router = useRouter();
  const userId = useUserId();
  const pendingRecurringDraft = useAppStore((st) => st.pendingRecurringDraft);
  const setPendingRecurringDraft = useAppStore((st) => st.setPendingRecurringDraft);
  const accountsQ = useAccounts();
  const rulesQ = useRecurringRules();
  const goalsQ = useGoals();

  const [bulkBillsOpen, setBulkBillsOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>('bill');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [cadence, setCadence] = useState<Cadence>('monthly');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const [weeklyDow, setWeeklyDow] = useState<number>(1); // Mon
  const [monthlyDay, setMonthlyDay] = useState<number>(1);

  useEffect(() => {
    if (!pendingRecurringDraft) return;
    // Only handle bill/income/transfer drafts here.
    const d: any = pendingRecurringDraft;
    if (!d || !d.kind) return;

    if (d.kind === 'bill' || d.kind === 'income' || d.kind === 'transfer') {
      setKind(d.kind);
      setName(String(d.name ?? ''));
      setAmount(String(d.amount ?? ''));
      setCadence(d.cadence ?? 'monthly');
      if (typeof d.weeklyDow === 'number') setWeeklyDow(d.weeklyDow);
      if (typeof d.monthlyDay === 'number') setMonthlyDay(d.monthlyDay);
      if (typeof d.accountId === 'string' && d.accountId) setAccountId(d.accountId);
      if (typeof d.toAccountId === 'string') setToAccountId(d.toAccountId);
      setOpen(true);
    }

    // Clear so we don't re-open every render
    setPendingRecurringDraft(null);
  }, [pendingRecurringDraft]);

  const accounts = accountsQ.data ?? [];

  const [planSort, setPlanSort] = useState<PlanSortKey>('date');

  const [goalOpen, setGoalOpen] = useState(false);
  const [goalName, setGoalName] = useState('');
  const [goalTargetAmount, setGoalTargetAmount] = useState('');
  const [goalTargetDate, setGoalTargetDate] = useState(toIsoDate(new Date()));
  const [goalStartingBalance, setGoalStartingBalance] = useState('');
  const [goalFundingAccountId, setGoalFundingAccountId] = useState<string | null>(null);
  const [goalFundingAmount, setGoalFundingAmount] = useState('');

  const canCreate =
    Boolean(db) &&
    Boolean(userId) &&
    Boolean(name.trim()) &&
    Number.isFinite(Number(amount)) &&
    Boolean(accountId) &&
    (kind !== 'transfer' || (Boolean(toAccountId) && toAccountId !== accountId));

  const grouped = useMemo(() => {
    const rules = rulesQ.data ?? [];
    return {
      income: rules.filter((r) => r.kind === 'income'),
      bills: rules.filter((r) => r.kind === 'bill'),
      transfers: rules.filter((r) => r.kind === 'transfer'),
    };
  }, [rulesQ.data]);

  const sortedIncome = useMemo(() => {
    const arr = grouped.income.slice().sort((a, b) => compareRecurringRules(a, b, planSort));
    return arr;
  }, [grouped.income, planSort]);

  const sortedBills = useMemo(() => {
    return grouped.bills.slice().sort((a, b) => compareRecurringRules(a, b, planSort));
  }, [grouped.bills, planSort]);

  const sortedTransfers = useMemo(() => {
    return grouped.transfers.slice().sort((a, b) => compareRecurringRules(a, b, planSort));
  }, [grouped.transfers, planSort]);

  const sortedGoals = useMemo(() => {
    return (goalsQ.data ?? []).slice().sort((a, b) => compareGoals(a, b, planSort));
  }, [goalsQ.data, planSort]);

  const accountNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of accounts) m.set(a.id, (a as any).name ?? 'Account');
    return m;
  }, [accounts]);

  // Used to clean up materialized scheduledEvents when deleting recurring rules/goals.
  const scheduledInstant: any = db?.useQuery(
    (userId
      ? {
          scheduledEvents: {
            $: {
              where: {
                userId,
              },
            },
          },
        }
      : {}) as any
  );
  const scheduledAll = (scheduledInstant?.data?.scheduledEvents ?? []) as any[];

  async function deleteRecurringRule(ruleId: string, label: string) {
    const client = db;
    if (!client) return;

    Alert.alert('Delete recurring item?', label, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const toDeleteEvents = scheduledAll.filter((e) => e.ruleId === ruleId);
            await client.transact([
              ...toDeleteEvents.map((e) => client.tx.scheduledEvents[e.id].delete()),
              client.tx.recurringRules[ruleId].delete(),
            ]);
          } catch (e: any) {
            Alert.alert('Could not delete', e?.message ?? 'Unknown error');
          }
        },
      },
    ]);
  }

  async function deleteGoal(goal: any) {
    const client = db;
    if (!client) return;

    const label = String(goal?.name ?? 'Goal');
    Alert.alert('Delete goal?', label, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const txs: any[] = [];

            // Delete linked recurring rule + its scheduled events if present.
            const rrid = goal?.recurringRuleId as string | undefined;
            if (rrid) {
              const toDeleteEvents = scheduledAll.filter((e) => e.ruleId === rrid);
              txs.push(...toDeleteEvents.map((e) => client.tx.scheduledEvents[e.id].delete()));
              txs.push(client.tx.recurringRules[rrid].delete());
            }

            txs.push(client.tx.goals[goal.id].delete());

            await client.transact(txs);
          } catch (e: any) {
            Alert.alert('Could not delete', e?.message ?? 'Unknown error');
          }
        },
      },
    ]);
  }

  async function saveBulkBills(params: BulkAddSaveParams) {
    if (params.mode !== 'bills') return;
    const client = db;
    if (!client || !userId) return;
    try {
      const { accountId, cadence, weeklyDow, monthlyDay, rows } = params;
      const startDate = cadence === 'monthly' ? nextMonthDayFromTodayUTC(monthlyDay) : nextWeekdayFromTodayUTC(weeklyDow);

      const txs: any[] = [];
      for (const row of rows) {
        const id = newId();
        const amt = Math.abs(row.amount);
        const rule: any = {
          id,
          userId,
          accountId,
          kind: 'bill',
          name: row.description.trim() || 'Bill',
          amount: amt,
          cadence,
          startDate,
          nextRunAt: startDate,
        };
        const scheduled = materializeScheduledEvents({ rule: rule as any, userId });
        txs.push(client.tx.recurringRules[id].update(rule));
        txs.push(...scheduled.map((e) => client.tx.scheduledEvents[e.id].update(e)));
      }

      await client.transact(txs);
    } catch (e: any) {
      Alert.alert('Could not add bills', e?.message ?? 'Unknown error');
      throw e;
    }
  }

  async function createRule() {
    if (!db || !userId || !accountId) return;
    if (kind === 'transfer' && (!toAccountId || toAccountId === accountId)) {
      Alert.alert('Pick a destination', 'Choose a different to-account for the transfer.');
      return;
    }
    try {
      const instant = db;
      const id = newId();
      const startDate =
        cadence === 'monthly' ? nextMonthDayFromTodayUTC(monthlyDay) : nextWeekdayFromTodayUTC(weeklyDow);
      const nextRunAt = startDate;

      const amt = Math.abs(Number(amount));
      const rule: any = {
        id,
        userId,
        accountId,
        kind,
        name: name.trim(),
        amount: amt,
        cadence,
        startDate,
        nextRunAt,
      };
      if (kind === 'transfer' && toAccountId) rule.toAccountId = toAccountId;

      const scheduled = materializeScheduledEvents({
        rule: rule as any,
        userId,
      });

      const txs: any[] = [
        instant.tx.recurringRules[id].update(rule),
        ...scheduled.map((e) => instant.tx.scheduledEvents[e.id].update(e)),
      ];

      await instant.transact(txs);

      setOpen(false);
      setName('');
      setAmount('');
      setCadence('monthly');
      setKind('bill');
      setToAccountId(null);
    } catch (e: any) {
      Alert.alert('Could not create rule', e?.message ?? 'Unknown error');
    }
  }

  async function createGoal() {
    if (!db || !userId) return;
    try {
      const id = newId();
      const amt = Number(goalTargetAmount);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error('Target amount must be a positive number');
      const dateTrim = goalTargetDate.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateTrim)) throw new Error('Target date must be YYYY-MM-DD');
      const now = new Date().toISOString();

      const startingBalanceNum = goalStartingBalance.trim() === '' ? 0 : Number(goalStartingBalance);
      if (!Number.isFinite(startingBalanceNum) || startingBalanceNum < 0) throw new Error('Starting balance must be non-negative');

      let fundingAmountNum: number | undefined = undefined;
      if (goalFundingAccountId && goalFundingAmount.trim() !== '') {
        const f = Number(goalFundingAmount);
        if (!Number.isFinite(f) || f < 0) throw new Error('Funding amount must be non-negative');
        fundingAmountNum = f;
      }

      const goalUpdate: Record<string, unknown> = {
        userId,
        name: goalName.trim() || 'Goal',
        targetAmount: amt,
        targetDate: dateTrim,
        createdAt: now,
        startingBalance: startingBalanceNum,
      };
      if (goalFundingAccountId) goalUpdate.fundingAccountId = goalFundingAccountId;
      if (typeof fundingAmountNum === 'number') goalUpdate.fundingAmount = fundingAmountNum;

      await db.transact([db.tx.goals[id].update(goalUpdate as any)]);

      setGoalOpen(false);
      setGoalName('');
      setGoalTargetAmount('');
      setGoalTargetDate(toIsoDate(new Date()));
      setGoalStartingBalance('');
      setGoalFundingAccountId(null);
      setGoalFundingAmount('');
    } catch (e: any) {
      Alert.alert('Could not create goal', e?.message ?? 'Unknown error');
    }
  }

  if (!db) {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-100 px-6">
        <Text className="text-base text-neutral-700">Connect InstantDB to use Planning.</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-neutral-100">
      <View className="px-4 pb-3 pt-14">
        <HeaderBar
          title="Planning"
          onBulkAddBills={() => {
            if (!accounts.length) {
              Alert.alert('Create an account first', 'Add an account in the Accounts tab, then create recurring rules.');
              return;
            }
            setAccountId(accounts[0].id);
            setBulkBillsOpen(true);
          }}
          onAdd={() => {
            if (!accounts.length) {
              Alert.alert('Create an account first', 'Add an account in the Accounts tab, then create recurring rules.');
              return;
            }
            setAccountId(accounts[0].id);
            setOpen(true);
          }}
        />
      </View>

      <View className="flex-1 overflow-hidden rounded-t-3xl bg-white">
        <PlanSortBar sortBy={planSort} onSortBy={setPlanSort} />

        <RulesSection title="Recurring income" emptyText="No recurring income yet.">
          {sortedIncome.length
            ? sortedIncome.map((r) => (
                <Swipeable
                  key={r.id}
                  renderRightActions={() => (
                    <Pressable
                      className="h-full w-24 items-center justify-center bg-rose-600"
                      onPress={() => deleteRecurringRule(r.id, r.name || 'Recurring income')}
                    >
                      <Text className="text-xs font-semibold text-white">Delete</Text>
                    </Pressable>
                  )}
                >
                  <RuleRow
                    rule={r}
                    amountClass="text-sm font-semibold text-emerald-700"
                    amountText={r.amount.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
                  />
                </Swipeable>
              ))
            : undefined}
        </RulesSection>

        <RulesSection title="Recurring bills" emptyText="No recurring bills yet.">
          {sortedBills.length
            ? sortedBills.map((r) => (
                <Swipeable
                  key={r.id}
                  renderRightActions={() => (
                    <Pressable
                      className="h-full w-24 items-center justify-center bg-rose-600"
                      onPress={() => deleteRecurringRule(r.id, r.name || 'Recurring bill')}
                    >
                      <Text className="text-xs font-semibold text-white">Delete</Text>
                    </Pressable>
                  )}
                >
                  <RuleRow
                    rule={r}
                    amountClass="text-sm font-semibold text-rose-700"
                    amountText={(-Math.abs(r.amount)).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
                  />
                </Swipeable>
              ))
            : undefined}
        </RulesSection>

        <RulesSection title="Recurring transfers" emptyText="No recurring transfers yet.">
          {sortedTransfers.length
            ? sortedTransfers.map((r) => {
                const toName = (r as any).toAccountId ? accountNameById.get((r as any).toAccountId) ?? 'Account' : '—';
                const fromName = accountNameById.get(r.accountId) ?? 'Account';
                return (
                  <View key={r.id} className="flex-row items-center justify-between bg-white px-4 py-3">
                    <View className="flex-1 pr-4">
                      <Text className="text-sm font-semibold text-neutral-900" numberOfLines={1}>
                        {r.name}
                      </Text>
                      <Text className="mt-0.5 text-xs text-neutral-500">
                        {fromName} → {toName} • {r.cadence} • next {r.nextRunAt}
                      </Text>
                    </View>
                    <Text className="text-sm font-semibold text-sky-700">
                      {Math.abs(r.amount).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
                    </Text>
                  </View>
                );
              })
            : undefined}
        </RulesSection>

        <View className="bg-neutral-50 px-4 py-2">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-semibold text-neutral-600">Goals</Text>
            <Pressable
              className="rounded-lg bg-white px-2 py-1 active:opacity-90"
              onPress={() => {
                setGoalTargetDate(toIsoDate(new Date()));
                setGoalOpen(true);
              }}
            >
              <Text className="text-xs font-semibold text-emerald-700">Add goal</Text>
            </Pressable>
          </View>
        </View>
        {sortedGoals.length ? (
          sortedGoals.map((g: any) => (
            <Swipeable
              key={g.id}
              renderRightActions={() => (
                <Pressable className="h-full w-24 items-center justify-center bg-rose-600" onPress={() => deleteGoal(g)}>
                  <Text className="text-xs font-semibold text-white">Delete</Text>
                </Pressable>
              )}
            >
              <GoalRow goal={g} onOpen={(id) => router.push(`/goals/${id}`)} />
            </Swipeable>
          ))
        ) : (
          <View className="bg-white px-4 py-4">
            <Text className="text-sm text-neutral-500">No goals yet. Add one to track progress.</Text>
          </View>
        )}
      </View>

      <BulkAddModal
        mode="bills"
        open={bulkBillsOpen}
        onClose={() => setBulkBillsOpen(false)}
        accounts={accounts.map((a: any) => ({ id: a.id, name: String(a.name ?? 'Account') }))}
        accountId={accountId}
        setAccountId={(id) => setAccountId(id)}
        defaultDate={toIsoDate(new Date())}
        onSave={saveBulkBills}
      />

      <CreateRuleModal
        open={open}
        canCreate={canCreate}
        kind={kind}
        name={name}
        amount={amount}
        cadence={cadence}
        weeklyDow={weeklyDow}
        monthlyDay={monthlyDay}
        accountId={accountId}
        toAccountId={toAccountId}
        accounts={accounts}
        setKind={(k) => {
          setKind(k);
          if (k !== 'transfer') setToAccountId(null);
        }}
        setName={setName}
        setAmount={setAmount}
        setCadence={setCadence}
        setWeeklyDow={setWeeklyDow}
        setMonthlyDay={setMonthlyDay}
        setAccountId={(id) => {
          setAccountId(id);
          if (toAccountId === id) setToAccountId(null);
        }}
        setToAccountId={(id) => setToAccountId(id)}
        onClose={() => setOpen(false)}
        onCreate={createRule}
      />

      <CreateGoalModal
        open={goalOpen}
        name={goalName}
        targetAmount={goalTargetAmount}
        targetDate={goalTargetDate}
        startingBalance={goalStartingBalance}
        fundingAccountId={goalFundingAccountId}
        fundingAmount={goalFundingAmount}
        accounts={accounts}
        setName={setGoalName}
        setTargetAmount={setGoalTargetAmount}
        setTargetDate={setGoalTargetDate}
        setStartingBalance={setGoalStartingBalance}
        setFundingAccountId={setGoalFundingAccountId}
        setFundingAmount={setGoalFundingAmount}
        onClose={() => setGoalOpen(false)}
        onCreate={createGoal}
      />
    </View>
  );
}
