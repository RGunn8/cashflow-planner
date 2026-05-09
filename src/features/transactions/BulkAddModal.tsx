import React, { useEffect, useMemo, useState } from 'react';
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
import * as ImagePicker from 'expo-image-picker';

import { cashflowBackendBaseUrl } from '@/src/config/publicEnv';
import { parseBulkInput } from '@/src/features/transactions/parseBulkTransactions';
import { parseIsoDate, toIsoDate } from '@/src/utils/dates';

type AccountLite = { id: string; name: string };

export type BulkSaveRow = { amount: number; description: string; date?: string };

export type BillCadence = 'weekly' | 'biweekly' | 'monthly';

function mapBodyToTransactionRows(bodyText: string, mode: 'transactions' | 'bills'): { ok: true; rows: BulkSaveRow[] } | { ok: false; message: string } {
  let json: { transactions?: { description?: string; amount?: number; date?: string }[] };
  try {
    json = JSON.parse(bodyText) as typeof json;
  } catch {
    return { ok: false, message: 'Invalid JSON from server.' };
  }
  const txs = Array.isArray(json.transactions) ? json.transactions : [];
  const mapped: BulkSaveRow[] = txs
    .map((t) => ({
      description: String(t.description ?? '').trim() || 'Transaction',
      amount: Number(t.amount),
      ...(typeof t.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? { date: t.date } : {}),
    }))
    .filter((t) => Number.isFinite(t.amount));

  if (!mapped.length) {
    return {
      ok: false,
      message: mode === 'bills' ? 'No bills found in the response.' : 'No transactions found in the response.',
    };
  }

  if (mode === 'bills') {
    return {
      ok: true,
      rows: mapped.map((r) => ({ amount: Math.abs(r.amount), description: r.description })),
    };
  }

  return { ok: true, rows: mapped };
}

async function appendScreenshotPart(formData: FormData, uri: string) {
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    const blob = await res.blob();
    const isPng = (blob.type || '').includes('png') || /\.png(\?|$)/i.test(uri);
    const ext = isPng ? 'png' : 'jpg';
    formData.append('image', blob, `screenshot.${ext}`);
    return;
  }
  const isPng = /\.png(\?|$)/i.test(uri);
  const ext = isPng ? 'png' : 'jpg';
  const mime = isPng ? 'image/png' : 'image/jpeg';
  formData.append('image', { uri, name: `screenshot.${ext}`, type: mime } as unknown as Blob);
}

export type BulkAddSaveParams =
  | { mode: 'transactions'; defaultDate: string; accountId: string; rows: BulkSaveRow[] }
  | {
      mode: 'bills';
      accountId: string;
      cadence: BillCadence;
      weeklyDow: number;
      monthlyDay: number;
      rows: BulkSaveRow[];
    };

export function BulkAddModal(props: {
  open: boolean;
  /** `bills` creates recurring bill rules (Planning-style); default is past transactions. */
  mode?: 'transactions' | 'bills';
  accounts: AccountLite[];
  accountId: string | null;
  setAccountId: (id: string) => void;
  defaultDate: string;
  onClose: () => void;
  onSave: (params: BulkAddSaveParams) => Promise<void>;
}) {
  const mode = props.mode ?? 'transactions';
  const [text, setText] = useState('');
  /** Remount the multiline input after save — RN often keeps stale text when value is cleared. */
  const [textInputKey, setTextInputKey] = useState(0);
  const [date, setDate] = useState(props.defaultDate);
  const [dateOpen, setDateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiRows, setAiRows] = useState<BulkSaveRow[] | null>(null);
  const [aiParsing, setAiParsing] = useState(false);
  const [imageParsing, setImageParsing] = useState(false);

  const [cadence, setCadence] = useState<BillCadence>('monthly');
  const [weeklyDow, setWeeklyDow] = useState(1);
  const [monthlyDay, setMonthlyDay] = useState(1);

  useEffect(() => {
    if (props.open) setDate(props.defaultDate);
  }, [props.open, props.defaultDate]);

  useEffect(() => {
    if (props.open && mode === 'bills') {
      setCadence('monthly');
      setWeeklyDow(1);
      setMonthlyDay(1);
    }
  }, [props.open, mode]);

  useEffect(() => {
    if (!props.open) {
      setAiRows(null);
      setAiParsing(false);
      setImageParsing(false);
    }
  }, [props.open]);

  const backendBase = useMemo(() => cashflowBackendBaseUrl(), []);

  const parsed = useMemo(() => parseBulkInput(text), [text]);
  const validRows = useMemo(() => {
    const rows = parsed
      .filter((p): p is { ok: true; amount: number; description: string } => p.ok)
      .map((p) => ({ amount: p.amount, description: p.description }));
    if (mode === 'bills') {
      return rows.map((r) => ({ amount: Math.abs(r.amount), description: r.description }));
    }
    return rows;
  }, [parsed, mode]);
  const errorCount = parsed.filter((p) => !p.ok).length;

  const rowsReady: BulkSaveRow[] = useMemo(() => {
    if (aiRows) {
      if (mode === 'bills') {
        return aiRows.map((r) => ({ amount: Math.abs(r.amount), description: r.description }));
      }
      return aiRows;
    }
    return validRows.map((r) => ({ amount: r.amount, description: r.description }));
  }, [aiRows, validRows, mode]);

  const dateValue = useMemo(() => {
    const s = date?.trim?.() ?? '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return parseIsoDate(s);
    return new Date();
  }, [date]);

  function onPickDate(e: DateTimePickerEvent, d?: Date) {
    if (e.type !== 'set' || !d) {
      setDateOpen(false);
      return;
    }
    setDate(toIsoDate(d));
    setDateOpen(false);
  }

  async function submit() {
    if (!props.accountId || rowsReady.length === 0 || saving) return;
    setSaving(true);
    try {
      if (mode === 'bills') {
        await props.onSave({
          mode: 'bills',
          accountId: props.accountId,
          cadence,
          weeklyDow,
          monthlyDay,
          rows: rowsReady.map((r) => ({
            amount: Math.abs(r.amount),
            description: r.description.trim() || 'Bill',
          })),
        });
      } else {
        await props.onSave({
          mode: 'transactions',
          defaultDate: date.trim(),
          accountId: props.accountId,
          rows: rowsReady,
        });
      }
      setText('');
      setTextInputKey((k) => k + 1);
      setAiRows(null);
      setDate(props.defaultDate);
      props.onClose();
    } finally {
      setSaving(false);
    }
  }

  async function applyParseResponse(
    bodyText: string,
    res: Response,
    sourceLabel: string,
    opts?: { clearPastedText?: boolean }
  ) {
    if (!res.ok) {
      let msg = bodyText || res.statusText;
      try {
        const j = JSON.parse(bodyText);
        if (j?.error) msg = String(j.error);
      } catch {
        /* keep raw */
      }
      if (res.status === 503) {
        Alert.alert('AI temporarily unavailable', 'The server could not reach OpenAI. Try again in a moment.');
        return;
      }
      Alert.alert('Could not parse', msg || sourceLabel);
      return;
    }

    const mapped = mapBodyToTransactionRows(bodyText, mode);
    if (!mapped.ok) {
      Alert.alert(mode === 'bills' ? 'No bills found' : 'No transactions found', mapped.message);
      return;
    }
    if (opts?.clearPastedText) {
      setText('');
      setTextInputKey((k) => k + 1);
    }
    setAiRows(mapped.rows);
  }

  async function smartParse() {
    const base = backendBase;
    if (!base) {
      Alert.alert('Not configured', 'Set EXPO_PUBLIC_VOICE_API_URL or EXPO_PUBLIC_PARSE_API_URL to your backend URL.');
      return;
    }
    const raw = text.trim();
    if (!raw) {
      Alert.alert('Nothing to parse', 'Paste or type some transaction notes first.');
      return;
    }
    setAiParsing(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);
      const res = await fetch(`${base}/text/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ text: raw }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      const bodyText = await res.text().catch(() => '');
      await applyParseResponse(bodyText, res, 'text parse');
    } catch (e: unknown) {
      const name = e && typeof e === 'object' && 'name' in e ? String((e as { name?: string }).name) : '';
      if (name === 'AbortError') {
        Alert.alert('Timed out', 'Parsing took too long. Try shorter text or try again.');
      } else {
        Alert.alert('Parse failed', e instanceof Error ? e.message : 'Unknown error');
      }
    } finally {
      setAiParsing(false);
    }
  }

  async function parseTransactionsFromScreenshot(source: 'library' | 'camera') {
    const base = backendBase;
    if (!base) {
      Alert.alert('Not configured', 'Set EXPO_PUBLIC_VOICE_API_URL or EXPO_PUBLIC_PARSE_API_URL to your backend URL.');
      return;
    }

    try {
      if (source === 'library') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission needed', 'Allow photo library access to import a screenshot.');
          return;
        }
      } else {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission needed', 'Allow camera access to capture a screenshot.');
          return;
        }
      }

      const picked =
        source === 'library'
          ? await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              quality: 0.72,
              allowsEditing: false,
            })
          : await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              quality: 0.72,
              allowsEditing: false,
            });

      if (picked.canceled) return;
      const uri = picked.assets[0]?.uri;
      if (!uri) {
        Alert.alert('No image', 'Could not read the selected image.');
        return;
      }

      setImageParsing(true);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);
      const formData = new FormData();
      await appendScreenshotPart(formData, uri);

      const res = await fetch(`${base}/image/parse-transactions`, {
        method: 'POST',
        body: formData,
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      const bodyText = await res.text().catch(() => '');
      await applyParseResponse(bodyText, res, 'image parse', { clearPastedText: true });
    } catch (e: unknown) {
      const name = e && typeof e === 'object' && 'name' in e ? String((e as { name?: string }).name) : '';
      if (name === 'AbortError') {
        Alert.alert('Timed out', 'The image took too long to analyze. Try a smaller screenshot or again later.');
      } else {
        Alert.alert('Screenshot import failed', e instanceof Error ? e.message : 'Unknown error');
      }
    } finally {
      setImageParsing(false);
    }
  }

  if (!props.open) return null;

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
          <View className="mx-4 mt-16 rounded-2xl bg-white p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-semibold text-neutral-900">{mode === 'bills' ? 'Bulk add bills' : 'Bulk add'}</Text>
              <Pressable onPress={props.onClose}>
                <Text className="text-sm font-semibold text-neutral-600">Close</Text>
              </Pressable>
            </View>

            <Text className="mt-2 text-xs leading-5 text-neutral-600">
              {mode === 'bills' ? (
                <>
                  Add several <Text className="font-semibold">recurring bills</Text> at once (same cadence and account). Paste notes and tap{' '}
                  <Text className="font-semibold">Smart parse</Text> for AI, or type one bill per line — each needs an amount and label (e.g.{' '}
                  <Text className="font-mono text-[11px] text-neutral-800">1200 rent, 15 Netflix</Text>
                  ). Amounts are treated as money owed (like the single bill form).
                </>
              ) : (
                <>
                  Paste messy notes (bullet list, receipt text, etc.) and tap <Text className="font-semibold">Smart parse</Text> to use AI, or type
                  structured lines yourself — commas or new lines; each item needs an amount and a label (e.g.{' '}
                  <Text className="font-mono text-[11px] text-neutral-800">12.50 lunch, coffee -3</Text>
                  ).
                </>
              )}
            </Text>

            {mode === 'transactions' ? (
              <View className="mt-4">
                <Text className="mb-2 text-xs font-semibold text-neutral-700">Date</Text>
                {Platform.OS === 'web' ? (
                  <TextInput
                    className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base"
                    value={date}
                    onChangeText={setDate}
                    placeholder="YYYY-MM-DD"
                  />
                ) : (
                  <Pressable
                    className="flex-row items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3"
                    onPress={() => setDateOpen(true)}
                  >
                    <Text className="text-base text-neutral-900">{date}</Text>
                    <Text className="text-xs font-semibold text-emerald-700">Pick</Text>
                  </Pressable>
                )}
                {dateOpen && Platform.OS !== 'web' ? (
                  <View className="mt-2 overflow-hidden rounded-xl border border-neutral-200 bg-white">
                    <DateTimePicker value={dateValue} mode="date" onChange={onPickDate} />
                  </View>
                ) : null}
              </View>
            ) : (
              <>
                <View className="mt-4">
                  <Text className="mb-2 text-xs font-semibold text-neutral-700">Cadence</Text>
                  <View className="flex-row gap-2">
                    {(['weekly', 'biweekly', 'monthly'] as BillCadence[]).map((c) => (
                      <Pressable
                        key={c}
                        className={c === cadence ? 'flex-1 rounded-xl bg-neutral-900 px-3 py-2' : 'flex-1 rounded-xl bg-neutral-100 px-3 py-2'}
                        onPress={() => setCadence(c)}
                      >
                        <Text
                          className={
                            c === cadence ? 'text-center text-xs font-semibold text-white' : 'text-center text-xs font-semibold text-neutral-700'
                          }
                        >
                          {c}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {cadence === 'weekly' || cadence === 'biweekly' ? (
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
                          className={d.dow === weeklyDow ? 'rounded-xl bg-neutral-900 px-3 py-2' : 'rounded-xl bg-neutral-100 px-3 py-2'}
                          onPress={() => setWeeklyDow(d.dow)}
                        >
                          <Text className={d.dow === weeklyDow ? 'text-xs font-semibold text-white' : 'text-xs font-semibold text-neutral-700'}>
                            {d.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : (
                  <View className="mt-4">
                    <Text className="mb-2 text-xs font-semibold text-neutral-700">Day of month</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {[1, 5, 10, 15, 20, 25, 28, 30, 31].map((d) => (
                        <Pressable
                          key={d}
                          className={d === monthlyDay ? 'rounded-xl bg-neutral-900 px-3 py-2' : 'rounded-xl bg-neutral-100 px-3 py-2'}
                          onPress={() => setMonthlyDay(d)}
                        >
                          <Text className={d === monthlyDay ? 'text-xs font-semibold text-white' : 'text-xs font-semibold text-neutral-700'}>{d}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text className="mt-2 text-[11px] text-neutral-500">Next occurrences follow the same rules as Add → Bill.</Text>
                  </View>
                )}
              </>
            )}

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

            <View className="mt-4">
              <Text className="mb-2 text-xs font-semibold text-neutral-700">{mode === 'bills' ? 'Bills' : 'Transactions'}</Text>
              <TextInput
                key={textInputKey}
                className="min-h-[120px] rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base"
                value={text}
                onChangeText={(v) => {
                  setText(v);
                  setAiRows(null);
                }}
                placeholder={
                  mode === 'bills'
                    ? 'e.g. 1200 rent, 45 utilities, Netflix 15'
                    : 'Paste anything, or: 12.50 lunch, -8 coffee, groceries 45'
                }
                multiline
                textAlignVertical="top"
              />
            </View>

            <View className="mt-3 flex-row gap-2">
              <Pressable
                className={`flex-1 items-center justify-center rounded-xl border border-emerald-600 py-3 ${!backendBase || aiParsing || imageParsing ? 'opacity-50' : ''}`}
                disabled={!backendBase || aiParsing || imageParsing}
                onPress={() => void smartParse()}
              >
                <Text className="text-sm font-semibold text-emerald-700">{aiParsing ? 'Parsing…' : 'Smart parse (AI)'}</Text>
              </Pressable>
              {aiRows ? (
                <Pressable className="flex-1 items-center justify-center rounded-xl border border-neutral-300 py-3" onPress={() => setAiRows(null)}>
                  <Text className="text-sm font-semibold text-neutral-700">Use manual parse</Text>
                </Pressable>
              ) : null}
            </View>
            {mode === 'transactions' ? (
              <View className="mt-2">
                <View className="flex-row gap-2">
                  <Pressable
                    className={`flex-1 items-center justify-center rounded-xl border border-neutral-800 py-3 ${!backendBase || aiParsing || imageParsing ? 'opacity-50' : ''}`}
                    disabled={!backendBase || aiParsing || imageParsing}
                    onPress={() => void parseTransactionsFromScreenshot('library')}
                  >
                    <Text className="text-sm font-semibold text-neutral-900">
                      {imageParsing ? 'Analyzing…' : 'Photo library'}
                    </Text>
                  </Pressable>
                  <Pressable
                    className={`flex-1 items-center justify-center rounded-xl border border-neutral-800 py-3 ${!backendBase || aiParsing || imageParsing ? 'opacity-50' : ''}`}
                    disabled={!backendBase || aiParsing || imageParsing}
                    onPress={() => void parseTransactionsFromScreenshot('camera')}
                  >
                    <Text className="text-sm font-semibold text-neutral-900">{imageParsing ? 'Analyzing…' : 'Take photo'}</Text>
                  </Pressable>
                </View>
                <Text className="mt-2 text-[11px] leading-4 text-neutral-500">
                  Send a bank activity screenshot to your parse server; OpenAI vision returns rows you can review and add to this account.
                </Text>
              </View>
            ) : null}
            {!backendBase ? (
              <Text className="mt-2 text-[11px] text-amber-800">
                Set EXPO_PUBLIC_VOICE_API_URL (or EXPO_PUBLIC_PARSE_API_URL) for text and screenshot import.
              </Text>
            ) : null}

            <View className="mt-4 rounded-xl border border-neutral-100 bg-neutral-50 p-3">
              <Text className="text-xs font-semibold text-neutral-700">
                Preview{aiRows ? ' · AI' : ''}
              </Text>
              {rowsReady.length === 0 && errorCount === 0 && !aiParsing ? (
                <Text className="mt-2 text-xs text-neutral-500">Parsed rows will appear here.</Text>
              ) : null}
              {rowsReady.map((r, i) => (
                <Text key={`${r.description}-${i}-${r.amount}`} className="mt-1 text-xs text-neutral-800">
                  <Text className={`font-semibold ${mode === 'bills' ? 'text-rose-700' : ''}`}>
                    {mode === 'bills'
                      ? (-Math.abs(r.amount)).toLocaleString(undefined, { style: 'currency', currency: 'USD' })
                      : r.amount.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
                  </Text>
                  {' — '}
                  {r.description}
                  {mode === 'transactions' && r.date ? <Text className="text-neutral-500">{` · ${r.date}`}</Text> : null}
                </Text>
              ))}
              {!aiRows
                ? parsed.map((p, i) =>
                    !p.ok ? (
                      <Text key={`err-${i}`} className="mt-1 text-xs text-rose-700">
                        Could not parse “{p.raw}”: {p.error}
                      </Text>
                    ) : null
                  )
                : null}
              {rowsReady.length > 0 ? (
                <Text className="mt-2 text-[11px] text-neutral-500">
                  {rowsReady.length} {mode === 'bills' ? 'bill' : 'transaction'}
                  {rowsReady.length === 1 ? '' : 's'} ready
                  {!aiRows && errorCount ? ` (${errorCount} skipped)` : ''}
                </Text>
              ) : null}
            </View>

            <Pressable
              className={`mt-5 h-12 items-center justify-center rounded-xl bg-emerald-600 ${!props.accountId || rowsReady.length === 0 || saving ? 'opacity-50' : ''}`}
              disabled={!props.accountId || rowsReady.length === 0 || saving}
              onPress={() => void submit()}
            >
              <Text className="text-base font-semibold text-white">
                {saving ? 'Saving…' : mode === 'bills' ? 'Add all bills' : 'Add all'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
