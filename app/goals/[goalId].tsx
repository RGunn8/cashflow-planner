import React, { useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { db } from '@/src/db/instant';
import { useAccounts } from '@/src/query/hooks/useAccounts';
import { useGoals } from '@/src/query/hooks/useGoals';
import { parseIsoDate, toIsoDate } from '@/src/utils/dates';
import { formatUsd } from '@/src/utils/money';

type GoalType = 'target' | 'recurring';

type PathRow = {
  id: string;
  iso: string; // scheduled date (YYYY-MM-DD)
  label: string;
  amount: number;
  running?: number;
};

type PlanOverrides = Record<string, number>;

function clampDayOfMonth(day: number) {
  if (!Number.isFinite(day)) return 1;
  return Math.max(1, Math.min(31, Math.floor(day)));
}

function monthLabel(iso: string) {
  const d = parseIsoDate(iso);
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function isoForMonthDay(y: number, m: number, dayOfMonth: number): string {
  const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const dd = Math.min(clampDayOfMonth(dayOfMonth), dim);
  return toIsoDate(new Date(Date.UTC(y, m, dd)));
}

function nextMonthsSchedule(params: { dayOfMonth: number; months: number }): string[] {
  const { dayOfMonth, months } = params;
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const out: string[] = [];
  for (let i = 0; i < months; i++) {
    const yy = y + Math.floor((m + i) / 12);
    const mm = (m + i) % 12;
    out.push(isoForMonthDay(yy, mm, dayOfMonth));
  }
  return out;
}

function monthsBetweenInclusive(fromIso: string, toIso: string): number {
  const a = parseIsoDate(fromIso);
  const b = parseIsoDate(toIso);
  const ay = a.getUTCFullYear();
  const am = a.getUTCMonth();
  const by = b.getUTCFullYear();
  const bm = b.getUTCMonth();
  return Math.max(1, (by - ay) * 12 + (bm - am) + 1);
}

function safeOverrides(x: any): PlanOverrides {
  if (!x || typeof x !== 'object') return {};
  const out: PlanOverrides = {};
  for (const [k, v] of Object.entries(x)) {
    if (typeof k !== 'string') continue;
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

export default function GoalDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ goalId: string }>();
  const goalId = params.goalId;

  const goalsQ = useGoals();
  const accountsQ = useAccounts();
  const goal = useMemo(() => (goalsQ.data ?? []).find((g) => g.id === goalId) ?? null, [goalId, goalsQ.data]);

  const fundingAccount = useMemo(() => {
    const fid = (goal as any)?.fundingAccountId as string | undefined;
    if (!fid) return null;
    return (accountsQ.data ?? []).find((a) => a.id === fid) ?? null;
  }, [accountsQ.data, goal]);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({}); // iso -> string amount
  const [saving, setSaving] = useState(false);

  if (!goal) {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-100 px-6">
        <Text className="text-base text-neutral-700">Goal not found.</Text>
      </View>
    );
  }

  const goalType = ((goal as any).goalType as GoalType | undefined) ?? 'target';
  const startingBalance = ((goal as any).startingBalance as number | undefined) ?? 0;
  const recurringAmount = (goal as any).recurringAmount as number | undefined;
  const recurringDay = ((goal as any).recurringDay as number | undefined) ?? 1;

  const targetAmount = (goal as any).targetAmount as number | undefined;
  const targetDate = (goal as any).targetDate as string | undefined;

  const planOverrides = useMemo(() => safeOverrides((goal as any).planOverrides), [goalId, (goal as any).planOverrides]);

  const schedule: string[] = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    if (goalType === 'target' && targetDate) {
      const months = monthsBetweenInclusive(todayIso, targetDate);
      return nextMonthsSchedule({ dayOfMonth: recurringDay, months });
    }
    return nextMonthsSchedule({ dayOfMonth: recurringDay, months: 12 });
  }, [goalType, recurringDay, targetDate]);

  const computedPlan = useMemo(() => {
    // Return a per-iso amount plan.
    const base: Record<string, number> = {};

    if (goalType === 'target' && typeof targetAmount === 'number' && targetDate) {
      const remaining = Math.max(0, targetAmount - startingBalance);
      const months = Math.max(1, schedule.length);
      const perMonth = typeof recurringAmount === 'number' && recurringAmount > 0 ? recurringAmount : remaining / months;
      for (const iso of schedule) base[iso] = perMonth;
    } else if (typeof recurringAmount === 'number' && recurringAmount > 0) {
      for (const iso of schedule) base[iso] = recurringAmount;
    } else {
      for (const iso of schedule) base[iso] = 0;
    }

    // Apply overrides.
    for (const [iso, amt] of Object.entries(planOverrides)) {
      if (iso in base) base[iso] = amt;
    }

    // If we're a target goal, and user is editing: we will re-balance from the first edited month onward.
    // The re-balance happens in-memory via `draft` (not persisted until Save).

    return base;
  }, [goalType, planOverrides, recurringAmount, schedule, startingBalance, targetAmount, targetDate]);

  const pathRows: PathRow[] = useMemo(() => {
    const rows: PathRow[] = [];
    let running = startingBalance;

    for (let i = 0; i < schedule.length; i++) {
      const iso = schedule[i];
      const baseAmt = computedPlan[iso] ?? 0;

      // Draft edit takes precedence.
      const draftVal = draft[iso];
      const draftNum = draftVal != null && draftVal.trim() !== '' ? Number(draftVal) : NaN;
      const amt = Number.isFinite(draftNum) ? draftNum : baseAmt;

      running += amt;
      rows.push({
        id: `p-${iso}`,
        iso,
        label: `${monthLabel(iso)} (on ${iso})`,
        amount: amt,
        running,
      });
    }

    return rows;
  }, [computedPlan, draft, schedule, startingBalance]);

  const headerSubtitle =
    goalType === 'recurring'
      ? `Recurring ${typeof recurringAmount === 'number' ? formatUsd(recurringAmount) : ''} / month`
      : `Target ${targetDate ?? '—'}`;

  function rebalanceFrom(iso: string, newAmount: number) {
    if (goalType !== 'target') return;
    if (typeof targetAmount !== 'number' || !targetDate) return;

    // Rebalance remaining months (after this iso) so final hits targetAmount.
    const idx = schedule.indexOf(iso);
    if (idx < 0) return;

    const months = schedule.length;

    // Calculate total committed through idx using: computedPlan + overrides + draft values, but force current iso to newAmount.
    let total = 0;
    for (let i = 0; i <= idx; i++) {
      const d = schedule[i];
      if (d === iso) {
        total += newAmount;
        continue;
      }
      const dv = draft[d];
      const dn = dv != null && dv.trim() !== '' ? Number(dv) : NaN;
      const amt = Number.isFinite(dn) ? dn : (computedPlan[d] ?? 0);
      total += amt;
    }

    const remainingNeeded = Math.max(0, targetAmount - (startingBalance + total));
    const remainingCount = Math.max(0, months - (idx + 1));
    if (remainingCount <= 0) return;

    const perRemaining = remainingNeeded / remainingCount;

    // Set draft for remaining months (only those not explicitly edited already) to keep UX predictable.
    setDraft((prev) => {
      const next = { ...prev };
      for (let i = idx + 1; i < months; i++) {
        const d = schedule[i];
        if (next[d] != null && next[d].trim() !== '') continue; // keep user edits
        next[d] = perRemaining.toFixed(2);
      }
      return next;
    });
  }

  async function savePlan() {
    const client = db;
    if (!client) return;

    // Convert draft to overrides. Only store explicit edits (including auto-balanced values).
    const nextOverrides: PlanOverrides = { ...planOverrides };

    for (const iso of schedule) {
      const v = draft[iso];
      if (v == null || v.trim() === '') continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) continue;
      nextOverrides[iso] = n;
    }

    try {
      setSaving(true);
      await client.transact([client.tx.goals[goalId].update({ planOverrides: nextOverrides } as any)]);
      setEditing(false);
      setDraft({});
    } catch (e: any) {
      Alert.alert('Could not save plan', e?.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  function cancelEditing() {
    setEditing(false);
    setDraft({});
  }

  return (
    <View className="flex-1 bg-neutral-100">
      <View className="px-4 pb-3 pt-14">
        <View className="flex-row items-center justify-between">
          <Pressable onPress={() => router.back()}>
            <Text className="text-sm font-semibold text-neutral-700">Back</Text>
          </Pressable>

          {goalType === 'target' ? (
            editing ? (
              <View className="flex-row gap-2">
                <Pressable className="rounded-xl bg-neutral-100 px-3 py-2" onPress={cancelEditing} disabled={saving}>
                  <Text className="text-xs font-semibold text-neutral-800">Cancel</Text>
                </Pressable>
                <Pressable className="rounded-xl bg-emerald-600 px-3 py-2" onPress={savePlan} disabled={saving}>
                  <Text className="text-xs font-semibold text-white">Save</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable className="rounded-xl bg-neutral-900 px-3 py-2" onPress={() => setEditing(true)}>
                <Text className="text-xs font-semibold text-white">Edit path</Text>
              </Pressable>
            )
          ) : null}
        </View>

        <Text className="mt-3 text-2xl font-bold text-neutral-900">{goal.name}</Text>
        <Text className="mt-1 text-sm text-neutral-600">{headerSubtitle}</Text>
      </View>

      <View className="flex-1 overflow-hidden rounded-t-3xl bg-white">
        <View className="p-4">
          {goalType === 'target' ? (
            <View className="rounded-2xl bg-neutral-50 p-4">
              <Text className="text-xs font-semibold text-neutral-600">Target amount</Text>
              <Text className="mt-2 text-2xl font-bold text-neutral-900">{typeof targetAmount === 'number' ? formatUsd(targetAmount) : '—'}</Text>
              <Text className="mt-2 text-xs text-neutral-500">Starting balance: {formatUsd(startingBalance)}</Text>
            </View>
          ) : (
            <View className="rounded-2xl bg-neutral-50 p-4">
              <Text className="text-xs font-semibold text-neutral-600">Recurring contribution</Text>
              <Text className="mt-2 text-2xl font-bold text-neutral-900">{typeof recurringAmount === 'number' ? formatUsd(recurringAmount) : '—'}</Text>
              <Text className="mt-2 text-xs text-neutral-500">Day of month: {recurringDay}</Text>
              <Text className="mt-1 text-xs text-neutral-500">Starting balance: {formatUsd(startingBalance)}</Text>
            </View>
          )}

          <View className="mt-3 rounded-2xl bg-neutral-50 p-4">
            <Text className="text-xs font-semibold text-neutral-600">Attached account</Text>
            {fundingAccount ? (
              <Text className="mt-2 text-lg font-semibold text-neutral-900">{fundingAccount.name ?? 'Account'}</Text>
            ) : (
              <Text className="mt-2 text-sm text-neutral-500">No account attached.</Text>
            )}
          </View>

          <Text className="mt-6 text-xs font-semibold text-neutral-600">Path</Text>
          <Text className="mt-1 text-xs text-neutral-500">
            {goalType === 'target'
              ? editing
                ? 'Edit a month and we will update the remaining months to still hit your target.'
                : 'Planned monthly commitments to reach your target.'
              : 'Upcoming monthly contributions.'}
          </Text>
        </View>

        <FlashList
          data={pathRows}
          keyExtractor={(r) => r.id}
          ItemSeparatorComponent={() => <View className="h-px bg-neutral-100" />}
          ListEmptyComponent={() => (
            <View className="px-4 py-6">
              <Text className="text-sm text-neutral-500">No schedule yet. Add a recurring amount to see the path.</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <View className="flex-row items-center justify-between bg-white px-4 py-3">
              <View className="flex-1 pr-4">
                <Text className="text-sm font-semibold text-neutral-900" numberOfLines={1}>
                  {item.label}
                </Text>
                {typeof item.running === 'number' ? (
                  <Text className="mt-0.5 text-xs text-neutral-500">Running: {formatUsd(item.running)}</Text>
                ) : null}
              </View>

              {editing && goalType === 'target' ? (
                <TextInput
                  className="w-24 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-right text-sm font-semibold text-neutral-900"
                  value={draft[item.iso] ?? String(item.amount.toFixed(2))}
                  onChangeText={(v) => {
                    setDraft((prev) => ({ ...prev, [item.iso]: v }));
                    const n = Number(v);
                    if (Number.isFinite(n) && n >= 0) rebalanceFrom(item.iso, n);
                  }}
                  keyboardType="decimal-pad"
                />
              ) : (
                <Text className="text-sm font-semibold text-amber-700">{formatUsd(item.amount)}</Text>
              )}
            </View>
          )}
        />
      </View>
    </View>
  );
}
