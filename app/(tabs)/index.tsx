import React, { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { DayDetailList, DayDetailItem } from '@/src/features/calendar/DayDetailList';
import { WeekStrip, WeekStripLine, WeekStripSummary } from '@/src/features/calendar/WeekStrip';
import {
  HomeTransactionModal,
  HomeWhatIfModal,
} from '@/src/features/home/HomeQuickAddModals';
import {
  filterScheduledEventsForHomeView,
  filterTransactionsForHomeView,
  isTransferTxn,
  isWhatIfTxn,
  whatIfDetailBucket,
} from '@/src/features/home/transactionFilters';
import { projectDays } from '@/src/features/projection/project';
import { db } from '@/src/db/instant';
import { useAccounts } from '@/src/query/hooks/useAccounts';
import { useScheduledEvents } from '@/src/query/hooks/useScheduledEvents';
import { useTransactionTags } from '@/src/query/hooks/useTransactionTags';
import { useUserId } from '@/src/query/hooks/useUserId';
import { useWhatIfTransactions } from '@/src/query/hooks/useWhatIfTransactions';
import { useAppStore } from '@/src/state/useAppStore';
import { computeActualBalancesAsOf } from '@/src/utils/balances';
import { addDays, formatMonthDay, parseIsoDate, startOfWeek, toIsoDate } from '@/src/utils/dates';
import { newId } from '@/src/utils/uuid';

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

type AccountLite = { id: string; name?: string | null; color?: string | null };

function formatRangeLabel(fromIso: string, days: number) {
  const toIso = addDays(fromIso, days - 1);
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);

  const fromMonth = from.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' });
  const toMonth = to.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' });
  const fromDay = from.toLocaleDateString(undefined, { day: '2-digit', timeZone: 'UTC' });
  const toDay = to.toLocaleDateString(undefined, { day: '2-digit', timeZone: 'UTC' });

  if (fromMonth === toMonth) return `${fromMonth} ${fromDay}–${toDay}`;
  return `${fromMonth} ${fromDay} – ${toMonth} ${toDay}`;
}

function HeaderBar(props: {
  title: string;
  rangeLabel: string;
  viewDays: 7 | 14;
  accountLabel: string;
  onOpenAccounts: () => void;
  onPrevRange: () => void;
  onNextRange: () => void;
  onToday: () => void;
  onSetViewDays: (d: 7 | 14) => void;
  onAdd: () => void;
}) {
  function Toggle({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
    return (
      <Pressable
        className={active ? 'flex-1 rounded-xl bg-neutral-900 px-3 py-1.5' : 'flex-1 rounded-xl bg-white px-3 py-1.5'}
        onPress={onPress}
      >
        <Text className={active ? 'text-center text-xs font-semibold text-white' : 'text-center text-xs font-semibold text-neutral-700'}>
          {label}
        </Text>
      </Pressable>
    );
  }

  return (
    <View className="gap-2">
      <View className="flex-row items-start justify-between">
        <View>
          <Text className="text-lg font-semibold text-neutral-900">{props.title}</Text>
          <View className="mt-1 flex-row items-center gap-2">
            <Pressable className="rounded-lg bg-white px-2 py-1" onPress={props.onPrevRange}>
              <Text className="text-xs font-semibold text-neutral-700">◀︎</Text>
            </Pressable>
            <Text className="text-xs font-semibold text-neutral-600">{props.rangeLabel}</Text>
            <Pressable className="rounded-lg bg-white px-2 py-1" onPress={props.onNextRange}>
              <Text className="text-xs font-semibold text-neutral-700">▶︎</Text>
            </Pressable>
            <Pressable className="rounded-lg bg-white px-2 py-1" onPress={props.onToday}>
              <Text className="text-xs font-semibold text-emerald-700">Today</Text>
            </Pressable>
          </View>
        </View>

        <View className="flex-row items-center gap-2">
          <Pressable className="rounded-xl bg-white px-2.5 py-1.5" onPress={props.onOpenAccounts}>
            <Text className="text-xs font-semibold text-neutral-700">Accts: {props.accountLabel}</Text>
          </Pressable>
          <Pressable className="h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 active:opacity-90" onPress={props.onAdd}>
            <Text className="text-lg font-bold text-white">+</Text>
          </Pressable>
        </View>
      </View>

      <View className="flex-row gap-2">
        <Toggle label="7d" active={props.viewDays === 7} onPress={() => props.onSetViewDays(7)} />
        <Toggle label="14d" active={props.viewDays === 14} onPress={() => props.onSetViewDays(14)} />
      </View>
    </View>
  );
}

function FilterPills(props: {
  showWhatIf: boolean;
  showIncome: boolean;
  showBills: boolean;
  showGoals: boolean;
  onToggleWhatIf: () => void;
  onToggleIncome: () => void;
  onToggleBills: () => void;
  onToggleGoals: () => void;
}) {
  function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
    return (
      <Pressable
        className={active ? 'rounded-full bg-neutral-900 px-3 py-1.5' : 'rounded-full bg-neutral-200 px-3 py-1.5'}
        onPress={onPress}
      >
        <Text className={active ? 'text-xs font-semibold text-white' : 'text-xs font-semibold text-neutral-500'}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <View className="mt-3 flex-row flex-wrap gap-2">
      <Pill label="What-if" active={props.showWhatIf} onPress={props.onToggleWhatIf} />
      <Pill label="Income" active={props.showIncome} onPress={props.onToggleIncome} />
      <Pill label="Bills" active={props.showBills} onPress={props.onToggleBills} />
      <Pill label="Goals" active={props.showGoals} onPress={props.onToggleGoals} />
    </View>
  );
}

function AccountPickerModal(props: {
  open: boolean;
  selectedAccountId: string | null;
  accounts: AccountLite[];
  onClose: () => void;
  onSelectAccountId: (id: string | null) => void;
}) {
  if (!props.open) return null;

  return (
    <View className="absolute inset-0 bg-black/30">
      <View className="mx-4 mt-24 rounded-2xl bg-white p-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-base font-semibold text-neutral-900">Accounts</Text>
          <Pressable onPress={props.onClose}>
            <Text className="text-sm font-semibold text-neutral-600">Close</Text>
          </Pressable>
        </View>

        <View className="mt-4 gap-2">
          <Pressable
            className={!props.selectedAccountId ? 'rounded-xl bg-neutral-900 px-3 py-3' : 'rounded-xl bg-neutral-100 px-3 py-3'}
            onPress={() => props.onSelectAccountId(null)}
          >
            <Text className={!props.selectedAccountId ? 'text-sm font-semibold text-white' : 'text-sm font-semibold text-neutral-800'}>
              All accounts
            </Text>
          </Pressable>

          {props.accounts.map((a) => (
            <Pressable
              key={a.id}
              className={a.id === props.selectedAccountId ? 'rounded-xl bg-neutral-900 px-3 py-3' : 'rounded-xl bg-neutral-100 px-3 py-3'}
              onPress={() => props.onSelectAccountId(a.id)}
            >
              <Text className={a.id === props.selectedAccountId ? 'text-sm font-semibold text-white' : 'text-sm font-semibold text-neutral-800'}>
                {a.name ?? 'Account'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const userId = useUserId();
  const selectedDay = useAppStore((s) => s.selectedDay);
  const setSelectedDay = useAppStore((s) => s.setSelectedDay);
  const selectedAccountId = useAppStore((s) => s.selectedAccountId);
  const setSelectedAccountId = useAppStore((s) => s.setSelectedAccountId);

  const todayIso = useMemo(() => toIsoDate(new Date()), []);

  const [acctOpen, setAcctOpen] = useState(false);
  const [txnOpen, setTxnOpen] = useState(false);
  const [whatIfOpen, setWhatIfOpen] = useState(false);

  const [viewDays, setViewDays] = useState<7 | 14>(7);

  const [showWhatIf, setShowWhatIf] = useState(true);
  const [showIncome, setShowIncome] = useState(true);
  const [showBills, setShowBills] = useState(true);
  const [showGoals, setShowGoals] = useState(true);

  const [txnDesc, setTxnDesc] = useState('');
  const [txnAmount, setTxnAmount] = useState('');
  const [txnTags, setTxnTags] = useState('');
  const [txnAccountId, setTxnAccountId] = useState<string | null>(null);

  const [whatIfDesc, setWhatIfDesc] = useState('');
  const [whatIfAmount, setWhatIfAmount] = useState('');
  const [whatIfTags, setWhatIfTags] = useState('');
  const [whatIfAccountId, setWhatIfAccountId] = useState<string | null>(null);


  const tagsQ = useTransactionTags();
  const knownTags = tagsQ.data ?? [];

  const rangeStart = useMemo(() => startOfWeek(selectedDay), [selectedDay]);
  const days = useMemo(() => Array.from({ length: viewDays }, (_, i) => addDays(rangeStart, i)), [rangeStart, viewDays]);
  const rangeKey = `${rangeStart}_${viewDays}`;
  const rangeEnd = useMemo(() => addDays(rangeStart, viewDays - 1), [rangeStart, viewDays]);

  const accountsQ = useAccounts();
  const accounts = (accountsQ.data ?? []) as AccountLite[];

  const accountColorById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of accounts) {
      m.set(a.id, (a.color ?? fallbackAccountColor(a.id)) as string);
    }
    return m;
  }, [accounts]);

  function colorsForAccountIds(accountIds: string[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const id of accountIds) {
      const c = accountColorById.get(id) ?? fallbackAccountColor(id);
      if (seen.has(c)) continue;
      seen.add(c);
      out.push(c);
    }
    return out;
  }

  function colorForAccount(accountId: string | null | undefined): string | undefined {
    if (!accountId) return undefined;
    return accountColorById.get(accountId) ?? fallbackAccountColor(accountId);
  }

  const eventsQ = useScheduledEvents({
    rangeKey,
    from: rangeStart,
    to: rangeEnd,
    accountId: selectedAccountId ?? undefined,
  });


  // Transactions: query all for user (Instant range queries can be flaky across screens) and filter client-side.
  const instantTxns: any = db?.useQuery(
    (userId
      ? {
          transactions: {
            $: {
              where: {
                userId,
                ...(selectedAccountId ? { accountId: selectedAccountId } : {}),
              },
            },
          },
        }
      : {}) as any
  );

  const txnsAll = (instantTxns?.data?.transactions ?? []) as any[];

  const txnsInRange = useMemo(() => {
    const from = `${rangeStart}T00:00:00.000Z`;
    const to = `${rangeEnd}T23:59:59.999Z`;
    return txnsAll.filter((t) => (t.postedAt ?? '') >= from && (t.postedAt ?? '') <= to);
  }, [rangeEnd, rangeStart, txnsAll]);

  // Opening balances at start of range, computed from all txns before rangeStart.
  const prevDayEnd = useMemo(() => `${addDays(rangeStart, -1)}T23:59:59.999Z`, [rangeStart]);

  const baselineTxns = useMemo(() => {
    return txnsAll.filter((t) => (t.postedAt ?? '') <= prevDayEnd);
  }, [prevDayEnd, txnsAll]);

  const openingBalanceByAccountId = useMemo(() => {
    return computeActualBalancesAsOf({
      accounts: (accountsQ.data ?? []) as any,
      transactions: baselineTxns as any,
      asOfIsoDateTime: prevDayEnd,
    });
  }, [accountsQ.data, baselineTxns, prevDayEnd]);

  const whatIfQ = useWhatIfTransactions();
  const whatIfAll = whatIfQ.data ?? [];
  const whatIfScoped = useMemo(
    () => (selectedAccountId ? whatIfAll.filter((t) => t.accountId === selectedAccountId) : whatIfAll),
    [selectedAccountId, whatIfAll]
  );

  const filteredEvents = useMemo(
    () => filterScheduledEventsForHomeView(eventsQ.data ?? [], { showIncome, showBills, showGoals }),
    [eventsQ.data, showIncome, showBills, showGoals]
  );

  const filteredTxns = useMemo(
    () =>
      filterTransactionsForHomeView(txnsInRange ?? [], {
        showWhatIf,
        showIncome,
        showBills,
        showGoals,
      }),
    [txnsInRange, showWhatIf, showIncome, showBills, showGoals]
  );

  const projection = useMemo(() => {
    return projectDays({
      accounts: accountsQ.data ?? [],
      accountId: selectedAccountId,
      days,
      scheduledEvents: filteredEvents,
      transactions: filteredTxns,
      openingBalanceByAccountId,
    });
  }, [accountsQ.data, selectedAccountId, days, filteredEvents, filteredTxns, openingBalanceByAccountId]);

  // Actual end-of-day balances (exclude what-if and scheduled). Used for balance line.
  const actualEodByDay: Record<string, number | undefined> = useMemo(() => {
    const openingById: Record<string, number> = openingBalanceByAccountId ?? {};

    const runningById: Record<string, number> = {};
    for (const a of accountsQ.data ?? []) {
      const id = (a as any).id as string;
      const base = typeof openingById[id] === 'number' ? openingById[id] : ((a as any).openingBalance ?? 0);
      runningById[id] = base;
    }

    const selectedIds = selectedAccountId
      ? (runningById[selectedAccountId] !== undefined ? [selectedAccountId] : Object.keys(runningById))
      : Object.keys(runningById);

    const txnsByDay = new Map<string, any[]>();
    for (const t of txnsInRange ?? []) {
      if (isWhatIfTxn(t as any)) continue;
      const day = String((t as any).postedAt ?? '').slice(0, 10);
      const arr = txnsByDay.get(day) ?? [];
      arr.push(t);
      txnsByDay.set(day, arr);
    }

    const out: Record<string, number | undefined> = {};
    for (const day of days) {
      const dayTxns = txnsByDay.get(day) ?? [];
      for (const t of dayTxns) {
        const aid = (t as any).accountId as string;
        runningById[aid] = (runningById[aid] ?? 0) + Number((t as any).amount ?? 0);
      }
      let sum = 0;
      for (const aid of selectedIds) sum += runningById[aid] ?? 0;
      out[day] = sum;
    }

    return out;
  }, [accountsQ.data, days, openingBalanceByAccountId, selectedAccountId, txnsInRange]);

  const weekSummaries: Record<string, WeekStripSummary> = useMemo(() => {
    const eventsByDay = new Map<string, any[]>();
    for (const e of filteredEvents) {
      const arr = eventsByDay.get(e.date) ?? [];
      arr.push(e);
      eventsByDay.set(e.date, arr);
    }

    const txnsByDay = new Map<string, any[]>();
    for (const t of filteredTxns) {
      const day = String(t.postedAt ?? '').slice(0, 10);
      const arr = txnsByDay.get(day) ?? [];
      arr.push(t);
      txnsByDay.set(day, arr);
    }

    const out: Record<string, WeekStripSummary> = {};

    for (const day of days) {
      const dayEvents = eventsByDay.get(day) ?? [];
      const dayTxns = txnsByDay.get(day) ?? [];

      let incomeAmt = 0;
      let billsAmt = 0;
      let goalsAmt = 0;
      let whatIfAmt = 0;
      let transferAmt = 0;

      const incomeAcctIds: string[] = [];
      const billsAcctIds: string[] = [];
      const goalsAcctIds: string[] = [];
      const whatIfAcctIds: string[] = [];
      const transferAcctIds: string[] = [];
      const seenTransferIds = new Set<string>();

      for (const e of dayEvents) {
        const amt = Number(e.amount ?? 0);
        if (e.kind === 'income') {
          incomeAmt += amt;
          incomeAcctIds.push(e.accountId);
        } else if (e.kind === 'bill') {
          billsAmt += amt;
          billsAcctIds.push(e.accountId);
        } else if (e.kind === 'goal') {
          goalsAmt += amt;
          goalsAcctIds.push(e.accountId);
        } else if (e.kind === 'transfer') {
          const tid = (e as any).transferId as string | undefined;
          if (tid && seenTransferIds.has(tid)) continue;
          if (tid) seenTransferIds.add(tid);
          transferAmt += Math.abs(amt);
          transferAcctIds.push(e.accountId);
        }
      }

      for (const t of dayTxns) {
        const amt = Number(t.amount ?? 0);
        if (isWhatIfTxn(t as any)) {
          whatIfAmt += amt;
          whatIfAcctIds.push(t.accountId);
          continue;
        }
        if (isTransferTxn(t as any)) {
          const tid = (t as any).transferId as string | undefined;
          if (tid && seenTransferIds.has(tid)) continue;
          if (tid) seenTransferIds.add(tid);
          transferAmt += Math.abs(amt);
          transferAcctIds.push(t.accountId);
          continue;
        }
        if (amt >= 0) {
          incomeAmt += amt;
          incomeAcctIds.push(t.accountId);
        } else {
          billsAmt += amt;
          billsAcctIds.push(t.accountId);
        }
      }

      const ordered: WeekStripLine[] = [];
      if (incomeAmt !== 0) ordered.push({ kind: 'income', amount: incomeAmt, accountColors: colorsForAccountIds(incomeAcctIds) });
      if (billsAmt !== 0) ordered.push({ kind: 'bill', amount: billsAmt, accountColors: colorsForAccountIds(billsAcctIds) });
      if (whatIfAmt !== 0) ordered.push({ kind: 'whatif', amount: whatIfAmt, accountColors: colorsForAccountIds(whatIfAcctIds) });
      if (transferAmt !== 0) ordered.push({ kind: 'transfer', amount: transferAmt, accountColors: colorsForAccountIds(transferAcctIds) });
      if (goalsAmt !== 0) ordered.push({ kind: 'goal', amount: goalsAmt, accountColors: colorsForAccountIds(goalsAcctIds) });

      out[day] = {
        eodBalance: actualEodByDay[day],
        lines: ordered,
      };
    }

    return out;
  }, [actualEodByDay, days, filteredEvents, filteredTxns, accountColorById]);

  const items: DayDetailItem[] = useMemo(() => {
    const rows: DayDetailItem[] = [];
    const dayEventsRaw = (eventsQ.data ?? []).filter((e) => e.date === selectedDay);
    const dayTxnsRaw = (txnsInRange ?? []).filter((t) => (t.postedAt ?? '').slice(0, 10) === selectedDay);

    const dayEvents = filterScheduledEventsForHomeView(dayEventsRaw, { showIncome, showBills, showGoals });
    const dayTxns = filterTransactionsForHomeView(dayTxnsRaw, { showWhatIf, showIncome, showBills, showGoals });

    const whatIfIncome = dayTxns.filter((t) => whatIfDetailBucket(t as any) === 'income');
    const whatIfBills = dayTxns.filter((t) => whatIfDetailBucket(t as any) === 'bill');
    const whatIfGoals = dayTxns.filter((t) => whatIfDetailBucket(t as any) === 'goal');

    const income = dayEvents.filter((e) => e.kind === 'income');
    const bills = dayEvents.filter((e) => e.kind === 'bill');
    const goals = dayEvents.filter((e) => e.kind === 'goal');
    const transfers = dayEvents.filter((e) => e.kind === 'transfer');

    const transferTxns = dayTxns.filter((t) => !isWhatIfTxn(t as any) && isTransferTxn(t as any));
    const actualIncomeTxns = dayTxns.filter((t) => !isWhatIfTxn(t as any) && !isTransferTxn(t as any) && (t.amount ?? 0) > 0);
    const actualBillTxns = dayTxns.filter((t) => !isWhatIfTxn(t as any) && !isTransferTxn(t as any) && (t.amount ?? 0) < 0);

    if (income.length || actualIncomeTxns.length || whatIfIncome.length) {
      rows.push({ type: 'section', id: 'sec-income', title: 'Income' });
      for (const e of income) {
        rows.push({
          type: 'row',
          id: `ev-${e.id}`,
          title: e.ruleId ? 'Scheduled income' : 'Income',
          subtitle: 'Scheduled',
          amount: e.amount,
          kind: 'income',
          dotColor: colorForAccount(e.accountId),
        });
      }
      for (const t of actualIncomeTxns) {
        rows.push({
          type: 'row',
          id: `tx-${t.id}`,
          title: t.description ?? 'Transaction',
          subtitle: 'Actual',
          amount: t.amount,
          kind: 'txn',
          dotColor: colorForAccount(t.accountId),
        });
      }
      for (const t of whatIfIncome) {
        rows.push({
          type: 'row',
          id: `tx-${t.id}`,
          title: t.description ?? 'What-if income',
          subtitle: 'What-if',
          amount: t.amount,
          kind: 'whatif',
          dotColor: colorForAccount(t.accountId),
        });
      }
    }

    if (bills.length || actualBillTxns.length || whatIfBills.length) {
      rows.push({ type: 'section', id: 'sec-bills', title: 'Bills' });
      for (const e of bills) {
        rows.push({
          type: 'row',
          id: `ev-${e.id}`,
          title: e.ruleId ? 'Scheduled bill' : 'Bill',
          subtitle: 'Scheduled',
          amount: e.amount,
          kind: 'bill',
          dotColor: colorForAccount(e.accountId),
        });
      }
      for (const t of actualBillTxns) {
        rows.push({
          type: 'row',
          id: `tx-${t.id}`,
          title: t.description ?? 'Transaction',
          subtitle: 'Actual',
          amount: t.amount,
          kind: 'txn',
          dotColor: colorForAccount(t.accountId),
        });
      }
      for (const t of whatIfBills) {
        rows.push({
          type: 'row',
          id: `tx-${t.id}`,
          title: t.description ?? 'What-if bill',
          subtitle: 'What-if',
          amount: t.amount,
          kind: 'whatif',
          dotColor: colorForAccount(t.accountId),
        });
      }
    }

    if (transfers.length || transferTxns.length) {
      rows.push({ type: 'section', id: 'sec-xfer', title: 'Transfers' });
      for (const e of transfers) {
        rows.push({
          type: 'row',
          id: `ev-${e.id}`,
          title: 'Scheduled transfer',
          subtitle: 'Scheduled',
          amount: e.amount,
          kind: 'transfer',
          dotColor: colorForAccount(e.accountId),
        });
      }
      for (const t of transferTxns) {
        rows.push({
          type: 'row',
          id: `tx-${t.id}`,
          title: t.description ?? 'Transfer',
          subtitle: 'Actual',
          amount: t.amount,
          kind: 'transfer',
          dotColor: colorForAccount(t.accountId),
        });
      }
    }

    if (goals.length || whatIfGoals.length) {
      rows.push({ type: 'section', id: 'sec-goals', title: 'Goals' });
      for (const e of goals) {
        rows.push({
          type: 'row',
          id: `ev-${e.id}`,
          title: e.ruleId ? 'Scheduled goal' : 'Goal',
          subtitle: 'Scheduled',
          amount: e.amount,
          kind: 'goal',
          dotColor: colorForAccount(e.accountId),
        });
      }
      for (const t of whatIfGoals) {
        rows.push({
          type: 'row',
          id: `tx-${t.id}`,
          title: t.description ?? 'What-if goal',
          subtitle: 'What-if',
          amount: t.amount,
          kind: 'whatif',
          dotColor: colorForAccount(t.accountId),
        });
      }
    }

    if (!rows.length) {
      rows.push({ type: 'section', id: 'sec-empty', title: 'No activity scheduled' });
      rows.push({ type: 'row', id: 'empty-1', title: 'Add a recurring bill or income in Planning' });
    }

    return rows;
  }, [eventsQ.data, selectedDay, showBills, showGoals, showIncome, showWhatIf, txnsInRange, accountColorById]);

  function openTxnModal() {
    if (selectedDay > todayIso) {
      Alert.alert('Future date', 'For future days, use a what-if instead.');
      return;
    }
    if (!accounts.length) {
      Alert.alert('Create an account first', 'Add an account in the Accounts tab.');
      return;
    }
    setTxnAccountId(selectedAccountId ?? accounts[0].id);
    setTxnOpen(true);
  }

  function openWhatIfModal() {
    if (selectedDay <= todayIso) {
      Alert.alert('Not a future date', 'What-if items are only for future days.');
      return;
    }
    if (!accounts.length) {
      Alert.alert('Create an account first', 'Add an account in the Accounts tab.');
      return;
    }
    setWhatIfAccountId(selectedAccountId ?? accounts[0].id);
    setWhatIfOpen(true);
  }

  function openPlus() {
    if (selectedDay > todayIso) openWhatIfModal();
    else openTxnModal();
  }

  async function submitHomeTransaction() {
    const client = db;
    if (!client || !userId) return;
    if (selectedDay > todayIso) {
      Alert.alert('Future date', 'For future days, use a what-if instead.');
      return;
    }
    const aid = txnAccountId ?? selectedAccountId ?? accounts[0]?.id;
    if (!aid) return;

    try {
      const id = newId();
      const postedAt = `${selectedDay}T12:00:00.000Z`;
      const amt = Number(txnAmount);
      if (!Number.isFinite(amt)) throw new Error('Amount must be a number');

      await client.transact([
        client.tx.transactions[id].update({
          userId,
          accountId: aid,
          postedAt,
          amount: amt,
          description: txnDesc.trim() || 'Transaction',
          tags: txnTags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          isWhatIf: false,
          matchStatus: 'needs_review',
        }),
      ]);

      setTxnDesc('');
      setTxnAmount('');
      setTxnTags('');
      setTxnOpen(false);
    } catch (e: any) {
      Alert.alert('Could not save transaction', e?.message ?? 'Unknown error');
    }
  }

  async function submitWhatIf() {
    const client = db;
    if (!client || !userId) return;
    if (selectedDay <= todayIso) {
      Alert.alert('Not a future date', 'What-if items are only for future days.');
      return;
    }
    const aid = whatIfAccountId ?? selectedAccountId ?? accounts[0]?.id;
    if (!aid) return;

    const amt = Number(whatIfAmount);
    if (!Number.isFinite(amt) || amt === 0) {
      Alert.alert('Invalid amount', 'Enter a non-zero amount (negative for spend).');
      return;
    }

    const whatIfKind = amt >= 0 ? ('income' as const) : ('bill' as const);

    try {
      const id = newId();
      await client.transact([
        client.tx.transactions[id].update({
          userId,
          accountId: aid,
          postedAt: `${selectedDay}T12:00:00.000Z`,
          amount: amt,
          description: whatIfDesc.trim() || 'What-if transaction',
          tags: whatIfTags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          isWhatIf: true,
          whatIfKind,
          matchStatus: 'what_if',
        }),
      ]);
      setWhatIfDesc('');
      setWhatIfAmount('');
      setWhatIfTags('');
      setWhatIfOpen(false);
    } catch (e: any) {
      Alert.alert('Could not save what-if', e?.message ?? 'Unknown error');
    }
  }

  function jumpToToday() {
    setSelectedDay(toIsoDate(new Date()));
  }

  function prevRange() {
    setSelectedDay(addDays(selectedDay, -viewDays));
  }

  function nextRange() {
    setSelectedDay(addDays(selectedDay, viewDays));
  }

  return (
    <View className="flex-1 bg-neutral-100">
      <View className="px-4 pb-3 pt-14">
        <HeaderBar
          title={formatMonthDay(selectedDay)}
          rangeLabel={formatRangeLabel(rangeStart, viewDays)}
          viewDays={viewDays}
          onSetViewDays={setViewDays}
          accountLabel={
            selectedAccountId
              ? (accounts.find((a) => a.id === selectedAccountId)?.name as string | undefined) ?? 'Selected'
              : 'All'
          }
          onOpenAccounts={() => setAcctOpen(true)}
          onPrevRange={prevRange}
          onNextRange={nextRange}
          onToday={jumpToToday}
          onAdd={openPlus}
        />

        <FilterPills
          showWhatIf={showWhatIf}
          showIncome={showIncome}
          showBills={showBills}
          showGoals={showGoals}
          onToggleWhatIf={() => setShowWhatIf((v) => !v)}
          onToggleIncome={() => setShowIncome((v) => !v)}
          onToggleBills={() => setShowBills((v) => !v)}
          onToggleGoals={() => setShowGoals((v) => !v)}
        />

        <View className="mt-3">
          <WeekStrip summaries={weekSummaries} days={days} />
        </View>
      </View>

      <View className="flex-1 overflow-hidden rounded-t-3xl bg-white">
        <DayDetailList items={items} />
      </View>

      <AccountPickerModal
        open={acctOpen}
        selectedAccountId={selectedAccountId}
        accounts={accounts}
        onClose={() => setAcctOpen(false)}
        onSelectAccountId={(id) => {
          setSelectedAccountId(id);
          setAcctOpen(false);
        }}
      />

      <HomeTransactionModal
        open={txnOpen}
        selectedDayLabel={formatMonthDay(selectedDay)}
        accounts={accounts}
        accountId={txnAccountId}
        desc={txnDesc}
        amount={txnAmount}
        tags={txnTags}
        knownTags={knownTags}
        setDesc={setTxnDesc}
        setAmount={setTxnAmount}
        setTags={setTxnTags}
        setAccountId={setTxnAccountId}
        onClose={() => setTxnOpen(false)}
        onSubmit={submitHomeTransaction}
      />

      <HomeWhatIfModal
        open={whatIfOpen}
        selectedDayLabel={formatMonthDay(selectedDay)}
        accounts={accounts}
        accountId={whatIfAccountId}
        desc={whatIfDesc}
        amount={whatIfAmount}
        tags={whatIfTags}
        knownTags={knownTags}
        setDesc={setWhatIfDesc}
        setAmount={setWhatIfAmount}
        setTags={setWhatIfTags}
        setAccountId={setWhatIfAccountId}
        onClose={() => setWhatIfOpen(false)}
        onSubmit={submitWhatIf}
      />
    </View>
  );
}
