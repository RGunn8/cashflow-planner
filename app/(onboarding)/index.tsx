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
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';

import { db } from '@/src/db/instant';
import { materializeScheduledEvents } from '@/src/features/planning/materialize';
import { parseBulkAccountsInput } from '@/src/features/onboarding/parseBulkAccounts';
import { parseBulkInput } from '@/src/features/transactions/parseBulkTransactions';
import { nextMonthDayFromTodayUTC, nextWeekdayFromTodayUTC } from '@/src/features/onboarding/recurringStartDates';
import { useAccounts } from '@/src/query/hooks/useAccounts';
import { useUserId } from '@/src/query/hooks/useUserId';
import { setOnboardingComplete } from '@/src/state/onboardingStorage';
import { useAppStore } from '@/src/state/useAppStore';
import { parseIsoDate, toIsoDate } from '@/src/utils/dates';
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

type Step = 'welcome' | 'accounts' | 'income' | 'bills' | 'goal' | 'done';

type Cadence = 'weekly' | 'biweekly' | 'monthly';

export default function OnboardingScreen() {
  const router = useRouter();
  const userId = useUserId();
  const accountsQ = useAccounts();
  const accounts = accountsQ.data ?? [];

  const [step, setStep] = useState<Step>('welcome');

  const [bulkAccountText, setBulkAccountText] = useState('');
  const [singleName, setSingleName] = useState('');
  const [singleBalance, setSingleBalance] = useState('0');
  const [singleType, setSingleType] = useState<'checking' | 'savings' | 'credit'>('checking');

  const [incomeName, setIncomeName] = useState('');
  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomeCadence, setIncomeCadence] = useState<Cadence>('monthly');
  const [incomeWeeklyDow, setIncomeWeeklyDow] = useState(1);
  const [incomeMonthlyDay, setIncomeMonthlyDay] = useState(1);
  const [incomeAccountId, setIncomeAccountId] = useState<string | null>(null);

  const [bulkBillText, setBulkBillText] = useState('');
  const [billName, setBillName] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [billCadence, setBillCadence] = useState<Cadence>('monthly');
  const [billWeeklyDow, setBillWeeklyDow] = useState(1);
  const [billMonthlyDay, setBillMonthlyDay] = useState(15);
  const [billAccountId, setBillAccountId] = useState<string | null>(null);

  const [goalName, setGoalName] = useState('');
  const [goalTargetAmount, setGoalTargetAmount] = useState('');
  const [goalTargetDate, setGoalTargetDate] = useState(toIsoDate(new Date()));
  const [goalDateOpen, setGoalDateOpen] = useState(false);

  const parsedAccounts = useMemo(() => parseBulkAccountsInput(bulkAccountText), [bulkAccountText]);
  const validParsedAccounts = useMemo(
    () =>
      parsedAccounts
        .filter((p): p is { ok: true; name: string; openingBalance: number } => p.ok)
        .map((p) => ({ name: p.name, openingBalance: p.openingBalance })),
    [parsedAccounts]
  );

  const parsedBulkBills = useMemo(() => parseBulkInput(bulkBillText), [bulkBillText]);
  const validBulkBills = useMemo(
    () =>
      parsedBulkBills
        .filter((p): p is { ok: true; amount: number; description: string } => p.ok)
        .map((p) => ({
          description: p.description.trim() || 'Bill',
          amount: Math.abs(p.amount),
        }))
        .filter((row) => row.amount > 0 && row.description.length > 0),
    [parsedBulkBills]
  );

  const markSessionOnboardingComplete = useAppStore((s) => s.markSessionOnboardingComplete);
  const bumpOnboardingStorageEpoch = useAppStore((s) => s.bumpOnboardingStorageEpoch);

  async function finishAndGoHome() {
    if (!userId) return;
    await setOnboardingComplete(userId, true);
    markSessionOnboardingComplete(userId);
    bumpOnboardingStorageEpoch();
    router.replace('/(tabs)');
  }

  async function skipEntireOnboarding() {
    await finishAndGoHome();
  }

  async function createAccountsFromBulk() {
    if (!db || !userId || validParsedAccounts.length === 0) return;
    try {
      const txs: any[] = [];
      let firstNewId: string | null = null;
      for (let i = 0; i < validParsedAccounts.length; i++) {
        const row = validParsedAccounts[i]!;
        const id = newId();
        if (i === 0) firstNewId = id;
        const color = ACCOUNT_COLORS[i % ACCOUNT_COLORS.length];
        txs.push(
          db.tx.accounts[id].update({
            userId,
            name: row.name,
            type: 'checking',
            currency: 'USD',
            openingBalance: row.openingBalance,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
            color,
          })
        );
      }
      await db.transact(txs);
      setBulkAccountText('');
      if (firstNewId) {
        setIncomeAccountId(firstNewId);
        setBillAccountId(firstNewId);
      }
      setStep('income');
    } catch (e: any) {
      Alert.alert('Could not create accounts', e?.message ?? 'Unknown error');
    }
  }

  async function createSingleAccount() {
    if (!db || !userId) return;
    const name = singleName.trim();
    const bal = Number(singleBalance);
    if (!name) {
      Alert.alert('Name required', 'Enter an account name.');
      return;
    }
    if (!Number.isFinite(bal)) {
      Alert.alert('Invalid balance', 'Opening balance must be a number.');
      return;
    }
    try {
      const id = newId();
      const color = ACCOUNT_COLORS[accounts.length % ACCOUNT_COLORS.length];
      await db.transact([
        db.tx.accounts[id].update({
          userId,
          name,
          type: singleType,
          currency: 'USD',
          openingBalance: bal,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          color,
        }),
      ]);
      setSingleName('');
      setSingleBalance('0');
    } catch (e: any) {
      Alert.alert('Could not create account', e?.message ?? 'Unknown error');
    }
  }

  function startDateForRule(c: Cadence, monthlyDay: number, weeklyDow: number) {
    return c === 'monthly' ? nextMonthDayFromTodayUTC(monthlyDay) : nextWeekdayFromTodayUTC(weeklyDow);
  }

  async function addIncomeRule() {
    if (!db || !userId) return;
    const aid = incomeAccountId ?? accounts[0]?.id;
    if (!aid) {
      Alert.alert('Pick an account', '');
      return;
    }
    const amt = Math.abs(Number(incomeAmount));
    if (!Number.isFinite(amt) || amt <= 0) {
      Alert.alert('Amount', 'Enter a positive income amount.');
      return;
    }
    const startDate = startDateForRule(incomeCadence, incomeMonthlyDay, incomeWeeklyDow);
    const client = db;
    try {
      const id = newId();
      const rule: any = {
        id,
        userId,
        accountId: aid,
        kind: 'income',
        name: incomeName.trim() || 'Income',
        amount: amt,
        cadence: incomeCadence,
        startDate,
        nextRunAt: startDate,
      };
      const scheduled = materializeScheduledEvents({ rule, userId });
      await client.transact([
        client.tx.recurringRules[id].update(rule),
        ...scheduled.map((e) => client.tx.scheduledEvents[e.id].update(e)),
      ]);
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? 'Unknown error');
    }
  }

  async function addBillRule() {
    if (!db || !userId) return;
    const aid = billAccountId ?? accounts[0]?.id;
    if (!aid) {
      Alert.alert('Pick an account', '');
      return;
    }
    const amt = Math.abs(Number(billAmount));
    if (!Number.isFinite(amt) || amt <= 0) {
      Alert.alert('Amount', 'Enter the bill amount.');
      return;
    }
    const startDate = startDateForRule(billCadence, billMonthlyDay, billWeeklyDow);
    const client = db;
    try {
      const id = newId();
      const rule: any = {
        id,
        userId,
        accountId: aid,
        kind: 'bill',
        name: billName.trim() || 'Bill',
        amount: amt,
        cadence: billCadence,
        startDate,
        nextRunAt: startDate,
      };
      const scheduled = materializeScheduledEvents({ rule: rule as any, userId });
      await client.transact([
        client.tx.recurringRules[id].update(rule),
        ...scheduled.map((e) => client.tx.scheduledEvents[e.id].update(e)),
      ]);
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? 'Unknown error');
    }
  }

  async function createBillsFromBulk() {
    if (!db || !userId || validBulkBills.length === 0) return;
    const aid = billAccountId ?? accounts[0]?.id;
    if (!aid) {
      Alert.alert('Pick an account', '');
      return;
    }
    const client = db;
    const startDate = startDateForRule(billCadence, billMonthlyDay, billWeeklyDow);
    try {
      const txs: any[] = [];
      for (const row of validBulkBills) {
        const id = newId();
        const rule: any = {
          id,
          userId,
          accountId: aid,
          kind: 'bill',
          name: row.description,
          amount: row.amount,
          cadence: billCadence,
          startDate,
          nextRunAt: startDate,
        };
        const scheduled = materializeScheduledEvents({ rule: rule as any, userId });
        txs.push(client.tx.recurringRules[id].update(rule));
        txs.push(...scheduled.map((e) => client.tx.scheduledEvents[e.id].update(e)));
      }
      await client.transact(txs);
      setBulkBillText('');
      setStep('goal');
    } catch (e: any) {
      Alert.alert('Could not create bills', e?.message ?? 'Unknown error');
    }
  }

  async function addGoal() {
    if (!db || !userId) return;
    try {
      const amt = Number(goalTargetAmount);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error('Target amount must be positive');
      const dateTrim = goalTargetDate.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateTrim)) throw new Error('Target date must be YYYY-MM-DD');
      const id = newId();
      await db.transact([
        db.tx.goals[id].update({
          userId,
          name: goalName.trim() || 'Goal',
          targetAmount: amt,
          targetDate: dateTrim,
          createdAt: new Date().toISOString(),
          startingBalance: 0,
        } as any),
      ]);
      setStep('done');
    } catch (e: any) {
      Alert.alert('Could not create goal', e?.message ?? 'Unknown error');
    }
  }

  const goalDateValue = useMemo(() => {
    const s = goalTargetDate?.trim?.() ?? '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return parseIsoDate(s);
    return new Date();
  }, [goalTargetDate]);

  function onGoalPickDate(e: DateTimePickerEvent, d?: Date) {
    if (e.type !== 'set' || !d) {
      setGoalDateOpen(false);
      return;
    }
    setGoalTargetDate(toIsoDate(d));
    setGoalDateOpen(false);
  }

  if (!db || !userId) {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-100 px-6">
        <Text className="text-center text-base text-neutral-600">Sign in to continue setup.</Text>
      </View>
    );
  }

  const canProceedAccounts = accounts.length >= 1;
  const primaryCta =
    'mt-6 h-12 w-full max-w-md items-center justify-center self-center rounded-2xl bg-emerald-600 active:opacity-90';
  const secondaryCta = 'mt-3 w-full max-w-md self-center py-2';

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-neutral-100"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 40, alignItems: 'center' }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="w-full max-w-md items-center px-5 pt-14">
          {step === 'welcome' ? (
            <>
              <Text className="text-center text-2xl font-bold text-neutral-900">Cash Calendar</Text>
              <Text className="mt-2 text-center text-base leading-6 text-neutral-600">
                Plan cash flow in one place: see when money comes in, when bills land, and how balances trend — without
                juggling spreadsheets.
              </Text>
              <Text className="mt-4 text-center text-sm font-semibold text-neutral-800">Why use it?</Text>
              <Text className="mt-2 text-center text-sm leading-5 text-neutral-600">
                • Know if you can cover bills before payday{'\n'}• Spot tight weeks on the calendar{'\n'}• Try what-if
                spending on future days{'\n'}• Link goals to real balances
              </Text>
              <Pressable className={primaryCta} onPress={() => setStep('accounts')}>
                <Text className="text-center text-base font-semibold text-white">Get started</Text>
              </Pressable>
              <Pressable className={secondaryCta} onPress={() => void skipEntireOnboarding()}>
                <Text className="text-center text-sm font-semibold text-neutral-500">Skip to calendar</Text>
              </Pressable>
            </>
          ) : null}

          {step === 'accounts' ? (
            <>
              <Text className="text-center text-xl font-bold text-neutral-900">Add accounts</Text>
              <Text className="mt-2 text-center text-sm leading-5 text-neutral-600">
                Create the accounts you want to track. Paste several at once (balance + name per line) or add them one
                at a time.
              </Text>

              <Text className="mt-6 w-full text-center text-xs font-semibold text-neutral-700">Bulk add (optional)</Text>
              <TextInput
                className="mt-2 w-full min-h-[100px] rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base"
                value={bulkAccountText}
                onChangeText={setBulkAccountText}
                placeholder={'2500 Main checking, 800 Savings, 400 Credit card'}
                multiline
                textAlignVertical="top"
              />
              {validParsedAccounts.length > 0 ? (
                <View className="mt-2 w-full rounded-xl border border-neutral-100 bg-white p-3">
                  <Text className="text-center text-xs font-semibold text-neutral-600">Ready to create</Text>
                  {validParsedAccounts.map((a, i) => (
                    <Text key={`${a.name}-${i}`} className="mt-1 text-center text-xs text-neutral-800">
                      {a.name} · {a.openingBalance.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
                    </Text>
                  ))}
                </View>
              ) : null}
              {parsedAccounts.some((p) => !p.ok) ? (
                <Text className="mt-2 text-center text-xs text-amber-800">Some lines could not be parsed. Fix or remove them.</Text>
              ) : null}
              <Pressable
                className={`mt-3 h-11 w-full max-w-md items-center justify-center self-center rounded-xl border border-emerald-600 ${validParsedAccounts.length === 0 ? 'opacity-40' : ''}`}
                disabled={validParsedAccounts.length === 0}
                onPress={() => void createAccountsFromBulk()}
              >
                <Text className="text-sm font-semibold text-emerald-700">Create from text</Text>
              </Pressable>

              <Text className="mt-8 w-full text-center text-xs font-semibold text-neutral-700">Or add one account</Text>
              <TextInput
                className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base"
                value={singleName}
                onChangeText={setSingleName}
                placeholder="Account name"
              />
              <TextInput
                className="mt-3 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base"
                value={singleBalance}
                onChangeText={setSingleBalance}
                keyboardType="decimal-pad"
                placeholder="Opening balance"
              />
              <View className="mt-3 w-full flex-row justify-center gap-2">
                {(['checking', 'savings', 'credit'] as const).map((t) => (
                  <Pressable
                    key={t}
                    className={singleType === t ? 'flex-1 rounded-xl bg-neutral-900 px-3 py-2' : 'flex-1 rounded-xl bg-neutral-100 px-3 py-2'}
                    onPress={() => setSingleType(t)}
                  >
                    <Text
                      className={
                        singleType === t ? 'text-center text-xs font-semibold text-white' : 'text-center text-xs font-semibold text-neutral-700'
                      }
                    >
                      {t}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                className="mt-3 h-11 w-full max-w-md items-center justify-center self-center rounded-xl bg-neutral-200"
                onPress={() => void createSingleAccount()}
              >
                <Text className="text-sm font-semibold text-neutral-800">Add this account</Text>
              </Pressable>

              <Text className="mt-6 w-full text-center text-xs text-neutral-500">
                {accounts.length} account{accounts.length === 1 ? '' : 's'} created
              </Text>
              <Pressable
                className={`${primaryCta} ${!canProceedAccounts ? 'opacity-40' : ''}`}
                disabled={!canProceedAccounts}
                onPress={() => {
                  setIncomeAccountId(accounts[0]?.id ?? null);
                  setBillAccountId(accounts[0]?.id ?? null);
                  setStep('income');
                }}
              >
                <Text className="text-center text-base font-semibold text-white">Continue</Text>
              </Pressable>
              <Pressable className={secondaryCta} onPress={() => setStep('welcome')}>
                <Text className="text-center text-sm font-semibold text-neutral-500">Back</Text>
              </Pressable>
            </>
          ) : null}

          {step === 'income' ? (
            <>
              <Text className="text-center text-xl font-bold text-neutral-900">Recurring income</Text>
              <Text className="mt-2 text-center text-sm text-neutral-600">Paychecks, freelance, or deposits you expect on a schedule.</Text>

              <AccountChips accounts={accounts} selectedId={incomeAccountId} onSelect={setIncomeAccountId} />

              <Text className="mt-4 w-full text-center text-xs font-semibold text-neutral-700">Name</Text>
              <TextInput
                className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3"
                value={incomeName}
                onChangeText={setIncomeName}
                placeholder="e.g. Paycheck"
              />
              <Text className="mt-4 w-full text-center text-xs font-semibold text-neutral-700">Amount</Text>
              <TextInput
                className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3"
                value={incomeAmount}
                onChangeText={setIncomeAmount}
                keyboardType="decimal-pad"
                placeholder="3000"
              />

              <CadenceBlock cadence={incomeCadence} setCadence={setIncomeCadence} />
              {incomeCadence === 'monthly' ? (
                <DayOfMonthChips value={incomeMonthlyDay} onChange={setIncomeMonthlyDay} />
              ) : (
                <DayOfWeekChips value={incomeWeeklyDow} onChange={setIncomeWeeklyDow} />
              )}

              <Pressable
                className="mt-4 h-11 w-full max-w-md items-center justify-center self-center rounded-xl bg-emerald-600"
                onPress={() => void addIncomeRule()}
              >
                <Text className="text-sm font-semibold text-white">Save income</Text>
              </Pressable>

              <Pressable className={primaryCta} onPress={() => setStep('bills')}>
                <Text className="text-center text-base font-semibold text-white">Continue</Text>
              </Pressable>
              <Pressable className={secondaryCta} onPress={() => setStep('accounts')}>
                <Text className="text-center text-sm font-semibold text-neutral-500">Back</Text>
              </Pressable>
            </>
          ) : null}

          {step === 'bills' ? (
            <>
              <Text className="text-center text-xl font-bold text-neutral-900">Recurring bills</Text>
              <Text className="mt-2 text-center text-sm text-neutral-600">
                Rent, utilities, subscriptions — so they show on your calendar. Paste several at once or add one by one.
              </Text>

              <AccountChips accounts={accounts} selectedId={billAccountId} onSelect={setBillAccountId} />

              <CadenceBlock cadence={billCadence} setCadence={setBillCadence} />
              {billCadence === 'monthly' ? (
                <DayOfMonthChips value={billMonthlyDay} onChange={setBillMonthlyDay} />
              ) : (
                <DayOfWeekChips value={billWeeklyDow} onChange={setBillWeeklyDow} />
              )}

              <Text className="mt-8 w-full text-center text-xs font-semibold text-neutral-700">Bulk add (optional)</Text>
              <Text className="mt-1 w-full text-center text-[11px] leading-4 text-neutral-500">
                Same format as accounts: amount + name per segment (e.g. 1200 rent, 15 Netflix, electric 85).
              </Text>
              <TextInput
                className="mt-2 w-full min-h-[100px] rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base"
                value={bulkBillText}
                onChangeText={setBulkBillText}
                placeholder={'1200 rent, 45 internet, 12.99 Netflix'}
                multiline
                textAlignVertical="top"
              />
              {validBulkBills.length > 0 ? (
                <View className="mt-2 w-full rounded-xl border border-neutral-100 bg-white p-3">
                  <Text className="text-center text-xs font-semibold text-neutral-600">Ready to create</Text>
                  {validBulkBills.map((b, i) => (
                    <Text key={`${b.description}-${i}`} className="mt-1 text-center text-xs text-neutral-800">
                      {(-b.amount).toLocaleString(undefined, { style: 'currency', currency: 'USD' })} · {b.description}
                    </Text>
                  ))}
                </View>
              ) : null}
              {parsedBulkBills.some((p) => !p.ok) ? (
                <Text className="mt-2 text-center text-xs text-amber-800">Some lines could not be parsed. Fix or remove them.</Text>
              ) : null}
              <Pressable
                className={`mt-3 h-11 w-full max-w-md items-center justify-center self-center rounded-xl border border-emerald-600 ${validBulkBills.length === 0 ? 'opacity-40' : ''}`}
                disabled={validBulkBills.length === 0}
                onPress={() => void createBillsFromBulk()}
              >
                <Text className="text-sm font-semibold text-emerald-700">Create from text</Text>
              </Pressable>

              <Text className="mt-8 w-full text-center text-xs font-semibold text-neutral-700">Or add one bill</Text>
              <Text className="mt-4 w-full text-center text-xs font-semibold text-neutral-700">Name</Text>
              <TextInput
                className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3"
                value={billName}
                onChangeText={setBillName}
                placeholder="Rent"
              />
              <Text className="mt-4 w-full text-center text-xs font-semibold text-neutral-700">Amount</Text>
              <TextInput
                className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3"
                value={billAmount}
                onChangeText={setBillAmount}
                keyboardType="decimal-pad"
                placeholder="1200"
              />

              <Pressable
                className="mt-4 h-11 w-full max-w-md items-center justify-center self-center rounded-xl bg-emerald-600"
                onPress={() => void addBillRule()}
              >
                <Text className="text-sm font-semibold text-white">Save bill</Text>
              </Pressable>

              <Pressable className={primaryCta} onPress={() => setStep('goal')}>
                <Text className="text-center text-base font-semibold text-white">Continue</Text>
              </Pressable>
              <Pressable className={secondaryCta} onPress={() => setStep('income')}>
                <Text className="text-center text-sm font-semibold text-neutral-500">Back</Text>
              </Pressable>
            </>
          ) : null}

          {step === 'goal' ? (
            <>
              <Text className="text-center text-xl font-bold text-neutral-900">A savings goal</Text>
              <Text className="mt-2 text-center text-sm text-neutral-600">Emergency fund, trip, or payoff target — you can refine this later.</Text>

              <Text className="mt-6 w-full text-center text-xs font-semibold text-neutral-700">Name</Text>
              <TextInput
                className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3"
                value={goalName}
                onChangeText={setGoalName}
                placeholder="Emergency fund"
              />
              <Text className="mt-4 w-full text-center text-xs font-semibold text-neutral-700">Target amount</Text>
              <TextInput
                className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3"
                value={goalTargetAmount}
                onChangeText={setGoalTargetAmount}
                keyboardType="decimal-pad"
                placeholder="5000"
              />
              <Text className="mt-4 w-full text-center text-xs font-semibold text-neutral-700">Target date</Text>
              {Platform.OS === 'web' ? (
                <TextInput
                  className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3"
                  value={goalTargetDate}
                  onChangeText={setGoalTargetDate}
                  placeholder="YYYY-MM-DD"
                />
              ) : (
                <Pressable
                  className="mt-2 w-full flex-row items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3"
                  onPress={() => setGoalDateOpen(true)}
                >
                  <Text className="flex-1 text-center text-base text-neutral-900">{goalTargetDate}</Text>
                  <Text className="text-xs font-semibold text-emerald-700">Pick</Text>
                </Pressable>
              )}
              {goalDateOpen && Platform.OS !== 'web' ? (
                <View className="mt-2 w-full overflow-hidden rounded-xl border border-neutral-200 bg-white">
                  <DateTimePicker value={goalDateValue} mode="date" onChange={onGoalPickDate} />
                </View>
              ) : null}

              <Pressable className={primaryCta} onPress={() => void addGoal()}>
                <Text className="text-center text-base font-semibold text-white">Save goal & finish</Text>
              </Pressable>
              <Pressable
                className="mt-3 h-12 w-full max-w-md items-center justify-center self-center rounded-2xl border border-neutral-200"
                onPress={() => void finishAndGoHome()}
              >
                <Text className="text-center text-base font-semibold text-neutral-700">Skip goal and go to calendar</Text>
              </Pressable>
              <Pressable className={secondaryCta} onPress={() => setStep('bills')}>
                <Text className="text-center text-sm font-semibold text-neutral-500">Back</Text>
              </Pressable>
            </>
          ) : null}

          {step === 'done' ? (
            <>
              <Text className="text-center text-2xl font-bold text-neutral-900">You are set up</Text>
              <Text className="mt-3 text-center text-base text-neutral-600">Your calendar is ready. You can add or edit anything later from the tabs.</Text>
              <Pressable className={primaryCta} onPress={() => void finishAndGoHome()}>
                <Text className="text-center text-base font-semibold text-white">Go to calendar</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function AccountChips(props: {
  accounts: { id: string; name?: string | null }[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <View className="mt-4 w-full items-center">
      <Text className="mb-2 w-full text-center text-xs font-semibold text-neutral-700">Account</Text>
      <View className="flex-row flex-wrap justify-center gap-2">
        {props.accounts.map((a) => (
          <Pressable
            key={a.id}
            className={a.id === props.selectedId ? 'rounded-xl bg-neutral-900 px-3 py-2' : 'rounded-xl bg-neutral-100 px-3 py-2'}
            onPress={() => props.onSelect(a.id)}
          >
            <Text className={a.id === props.selectedId ? 'text-xs font-semibold text-white' : 'text-xs font-semibold text-neutral-700'}>
              {a.name ?? 'Account'}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function CadenceBlock(props: { cadence: Cadence; setCadence: (c: Cadence) => void }) {
  return (
    <View className="mt-4 w-full items-center">
      <Text className="mb-2 w-full text-center text-xs font-semibold text-neutral-700">Cadence</Text>
      <View className="w-full flex-row gap-2">
        {(['weekly', 'biweekly', 'monthly'] as Cadence[]).map((c) => (
          <Pressable
            key={c}
            className={c === props.cadence ? 'flex-1 rounded-xl bg-neutral-900 px-3 py-2' : 'flex-1 rounded-xl bg-neutral-100 px-3 py-2'}
            onPress={() => props.setCadence(c)}
          >
            <Text className={c === props.cadence ? 'text-center text-xs font-semibold text-white' : 'text-center text-xs font-semibold text-neutral-700'}>
              {c}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function DayOfMonthChips(props: { value: number; onChange: (d: number) => void }) {
  return (
    <View className="mt-4 w-full items-center">
      <Text className="mb-2 w-full text-center text-xs font-semibold text-neutral-700">Day of month</Text>
      <View className="flex-row flex-wrap justify-center gap-2">
        {[1, 5, 10, 15, 20, 25, 28].map((d) => (
          <Pressable
            key={d}
            className={d === props.value ? 'rounded-xl bg-neutral-900 px-3 py-2' : 'rounded-xl bg-neutral-100 px-3 py-2'}
            onPress={() => props.onChange(d)}
          >
            <Text className={d === props.value ? 'text-xs font-semibold text-white' : 'text-xs font-semibold text-neutral-700'}>{d}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function DayOfWeekChips(props: { value: number; onChange: (dow: number) => void }) {
  return (
    <View className="mt-4 w-full items-center">
      <Text className="mb-2 w-full text-center text-xs font-semibold text-neutral-700">Day of week</Text>
      <View className="flex-row flex-wrap justify-center gap-2">
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
        ).map((x) => (
          <Pressable
            key={x.dow}
            className={x.dow === props.value ? 'rounded-xl bg-neutral-900 px-3 py-2' : 'rounded-xl bg-neutral-100 px-3 py-2'}
            onPress={() => props.onChange(x.dow)}
          >
            <Text className={x.dow === props.value ? 'text-xs font-semibold text-white' : 'text-xs font-semibold text-neutral-700'}>{x.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
