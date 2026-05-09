import React, { useEffect, useMemo, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { useAppStore } from '@/src/state/useAppStore';
import { addDays, formatWeekdayShort, startOfWeek } from '@/src/utils/dates';

function formatCompactCurrency(amount: number) {
  const abs = Math.abs(amount);
  if (abs >= 1000) return `${amount < 0 ? '-' : ''}$${(abs / 1000).toFixed(1)}k`;
  return amount.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export type WeekStripLine = {
  kind: 'income' | 'bill' | 'goal' | 'whatif' | 'transfer';
  amount: number;
  accountColors: string[];
};

export type WeekStripSummary = {
  eodBalance?: number;
  income?: number;
  bills?: number;
  goals?: number;
  /** Optional stacked breakdown (calendar home). When set, renders under the day number. */
  lines?: WeekStripLine[];
};

function lineTextClass(kind: WeekStripLine['kind']) {
  switch (kind) {
    case 'income':
      return 'text-[9px] font-semibold text-emerald-700';
    case 'bill':
      return 'text-[9px] font-semibold text-rose-700';
    case 'goal':
      return 'text-[9px] font-semibold text-amber-700';
    case 'whatif':
      return 'text-[9px] font-semibold text-violet-600';
    case 'transfer':
      return 'text-[9px] font-semibold text-sky-700';
    default:
      return 'text-[9px] font-semibold text-neutral-600';
  }
}

const ICON_INCOME = '#16a34a'; // emerald-600
const ICON_BILL = '#e11d48'; // rose-600
const ICON_GOAL = '#d97706'; // amber-600

function DayCell(props: {
  iso: string;
  isSelected: boolean;
  summary: WeekStripSummary | undefined;
  onPress: () => void;
  /** Muted when this day is padding outside the focused month (month view). */
  outsideFocusMonth?: boolean;
}) {
  const { iso: d, isSelected, summary, outsideFocusMonth } = props;
  const lines = summary?.lines?.slice(0, 3) ?? [];
  const hasIncome = lines.some((ln) => ln.kind === 'income');
  const hasBill = lines.some((ln) => ln.kind === 'bill');
  const hasGoal = lines.some((ln) => ln.kind === 'goal');

  const mute = Boolean(outsideFocusMonth) && !isSelected;

  return (
    <Pressable className="flex-1 items-center justify-center rounded-xl py-2" onPress={props.onPress}>
      <Text
        className={
          isSelected
            ? 'text-xs font-semibold text-emerald-800'
            : mute
              ? 'text-xs text-neutral-400'
              : 'text-xs text-neutral-500'
        }
      >
        {formatWeekdayShort(d)}
      </Text>
      <Text
        className={
          isSelected
            ? 'mt-1 text-base font-bold text-emerald-800'
            : mute
              ? 'mt-1 text-base font-semibold text-neutral-400'
              : 'mt-1 text-base font-semibold text-neutral-800'
        }
      >
        {d.slice(8, 10)}
      </Text>

      {hasIncome || hasBill || hasGoal ? (
        <View className={`mt-1 flex-row items-center justify-center gap-1 ${mute ? 'opacity-60' : ''}`}>
          {hasIncome ? <Ionicons name="trending-up" size={13} color={ICON_INCOME} /> : null}
          {hasBill ? <Ionicons name="receipt-outline" size={13} color={ICON_BILL} /> : null}
          {hasGoal ? <Ionicons name="flag" size={13} color={ICON_GOAL} /> : null}
        </View>
      ) : null}

      {lines.length > 0 ? (
        <View className={`mt-1 w-full items-center gap-0.5 px-0.5 ${mute ? 'opacity-70' : ''}`}>
          {lines.map((ln, idx) => (
            <View key={`${ln.kind}-${idx}`} className="flex-row items-center justify-center gap-1">
              <View className="flex-row gap-0.5">
                {ln.accountColors.slice(0, 4).map((c, j) => (
                  <View key={j} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c }} />
                ))}
              </View>
              <Text className={lineTextClass(ln.kind)} numberOfLines={1}>
                {formatCompactCurrency(ln.amount)}
              </Text>
            </View>
          ))}
          {typeof summary?.eodBalance === 'number' ? (
            <Text className="mt-0.5 text-[10px] font-semibold text-neutral-600">{formatCompactCurrency(summary.eodBalance)}</Text>
          ) : null}
        </View>
      ) : typeof summary?.eodBalance === 'number' ? (
        <Text className={`mt-1 text-[10px] font-semibold ${mute ? 'text-neutral-400' : 'text-neutral-600'}`}>
          {formatCompactCurrency(summary.eodBalance)}
        </Text>
      ) : (
        <Text className={`mt-1 text-[10px] ${mute ? 'text-neutral-300' : 'text-neutral-400'}`}>—</Text>
      )}
    </Pressable>
  );
}

function WeekRow(props: {
  days: string[];
  selectedDay: string;
  setSelectedDay: (d: string) => void;
  summaries?: Record<string, WeekStripSummary>;
  monthFocusBounds?: { from: string; to: string };
}) {
  const [rowWidth, setRowWidth] = useState(0);
  const colCount = Math.max(1, props.days.length);
  const selectedIndex = Math.max(0, props.days.indexOf(props.selectedDay));
  const isRowActive = props.days.includes(props.selectedDay);

  const indicatorX = useSharedValue(0);
  const cellW = rowWidth > 0 ? rowWidth / colCount : 0;

  useEffect(() => {
    if (!isRowActive) return;
    indicatorX.value = withTiming(selectedIndex * cellW, { duration: 180 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared value ref is stable
  }, [cellW, selectedIndex, isRowActive]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: cellW,
    opacity: isRowActive ? 1 : 0,
  }));

  return (
    <View className="relative flex-row" onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}>
      <Animated.View className="absolute top-0 h-full rounded-xl bg-emerald-500/10" style={indicatorStyle} />
      {props.days.map((d) => {
        const b = props.monthFocusBounds;
        const outside =
          b && (d < b.from || d > b.to) ? true : false;
        return (
          <DayCell
            key={d}
            iso={d}
            isSelected={d === props.selectedDay}
            summary={props.summaries?.[d]}
            onPress={() => props.setSelectedDay(d)}
            outsideFocusMonth={outside}
          />
        );
      })}
    </View>
  );
}

export function WeekStrip(props: {
  summaries?: Record<string, WeekStripSummary>;
  days?: string[];
  /** When set, days outside [from, to] render muted (padding weeks for month grid). */
  monthFocusBounds?: { from: string; to: string };
}) {
  const selectedDay = useAppStore((s) => s.selectedDay);
  const setSelectedDay = useAppStore((s) => s.setSelectedDay);

  const computedWeekStart = useMemo(() => startOfWeek(selectedDay), [selectedDay]);
  const computedDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(computedWeekStart, i)), [computedWeekStart]);

  const days = props.days && props.days.length ? props.days : computedDays;
  const weekRows = useMemo(() => {
    const rows: string[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      rows.push(days.slice(i, i + 7));
    }
    return rows;
  }, [days]);

  // Pan gesture shifts by week (7). Header arrows handle 7/14/month paging.
  const shiftDay = useMemo(() => {
    return (day: string, delta: number) => {
      setSelectedDay(addDays(day, delta));
    };
  }, [setSelectedDay]);

  const pan = useMemo(() => {
    return Gesture.Pan().onEnd((e) => {
      'worklet';
      const threshold = 40;
      if (e.translationX < -threshold) {
        runOnJS(shiftDay)(selectedDay, 7);
      } else if (e.translationX > threshold) {
        runOnJS(shiftDay)(selectedDay, -7);
      }
    });
  }, [selectedDay, shiftDay]);

  return (
    <GestureDetector gesture={pan}>
      <View className="rounded-2xl bg-white px-2 py-3">
        <View className="gap-2">
          {weekRows.map((rowDays, idx) => (
            <WeekRow
              key={`${rowDays[0]}-${idx}`}
              days={rowDays}
              selectedDay={selectedDay}
              setSelectedDay={setSelectedDay}
              summaries={props.summaries}
              monthFocusBounds={props.monthFocusBounds}
            />
          ))}
        </View>
      </View>
    </GestureDetector>
  );
}
