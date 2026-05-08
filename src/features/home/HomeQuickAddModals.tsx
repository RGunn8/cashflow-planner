import React from 'react';
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

import { TagAutocompleteField } from '@/src/features/transactions/TagAutocompleteField';

type AccountLite = { id: string; name?: string | null };

export function HomeTransactionModal(props: {
  open: boolean;
  selectedDayLabel: string;
  accounts: AccountLite[];
  accountId: string | null;
  desc: string;
  amount: string;
  tags: string;
  knownTags: string[];
  setDesc: (v: string) => void;
  setAmount: (v: string) => void;
  setTags: (v: string) => void;
  setAccountId: (id: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
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
          <View className="mx-4 mt-24 rounded-2xl bg-white p-4">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-base font-semibold text-neutral-900">Add transaction</Text>
                <Text className="mt-0.5 text-xs text-neutral-500">Date: {props.selectedDayLabel}</Text>
              </View>
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
                placeholder="e.g. Coffee"
              />
            </View>

            <View className="mt-4">
              <Text className="mb-2 text-xs font-semibold text-neutral-700">Amount (negative for spend)</Text>
              <TextInput
                className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base"
                value={props.amount}
                onChangeText={props.setAmount}
                keyboardType="decimal-pad"
                placeholder="-12"
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
                      {a.name ?? 'Account'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <Pressable className="mt-5 h-12 items-center justify-center rounded-xl bg-emerald-600" onPress={props.onSubmit}>
              <Text className="text-base font-semibold text-white">Save</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** Same shape as Add transaction; saved with isWhatIf + kind inferred from amount sign. */
export function HomeWhatIfModal(props: {
  open: boolean;
  selectedDayLabel: string;
  accounts: AccountLite[];
  accountId: string | null;
  desc: string;
  amount: string;
  tags: string;
  knownTags: string[];
  setDesc: (v: string) => void;
  setAmount: (v: string) => void;
  setTags: (v: string) => void;
  setAccountId: (id: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
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
          <View className="mx-4 mt-24 rounded-2xl bg-white p-4">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-base font-semibold text-neutral-900">What-if transaction</Text>
                <Text className="mt-0.5 text-xs text-neutral-500">Date: {props.selectedDayLabel}</Text>
              </View>
              <Pressable onPress={props.onClose}>
                <Text className="text-sm font-semibold text-neutral-600">Close</Text>
              </Pressable>
            </View>

            <Text className="mt-3 text-xs leading-5 text-neutral-600">
              Hypothetical entry for your projection only — same as adding a transaction, but marked what-if.
            </Text>

            <View className="mt-4">
              <Text className="mb-2 text-xs font-semibold text-neutral-700">Description</Text>
              <TextInput
                className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base"
                value={props.desc}
                onChangeText={props.setDesc}
                placeholder="e.g. Side gig"
              />
            </View>

            <View className="mt-4">
              <Text className="mb-2 text-xs font-semibold text-neutral-700">Amount (negative for spend)</Text>
              <TextInput
                className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base"
                value={props.amount}
                onChangeText={props.setAmount}
                keyboardType="decimal-pad"
                placeholder="-85"
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
                      {a.name ?? 'Account'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <Pressable className="mt-5 h-12 items-center justify-center rounded-xl bg-violet-600" onPress={props.onSubmit}>
              <Text className="text-base font-semibold text-white">Save</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** One-time transfer between two accounts. Persisted as two transactions with shared transferId. */
export function HomeTransferModal(props: {
  open: boolean;
  selectedDayLabel: string;
  accounts: AccountLite[];
  fromAccountId: string | null;
  toAccountId: string | null;
  desc: string;
  amount: string;
  setDesc: (v: string) => void;
  setAmount: (v: string) => void;
  setFromAccountId: (id: string) => void;
  setToAccountId: (id: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  if (!props.open) return null;

  const eligibleTo = props.accounts.filter((a) => a.id !== props.fromAccountId);

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
              <View>
                <Text className="text-base font-semibold text-neutral-900">Transfer</Text>
                <Text className="mt-0.5 text-xs text-neutral-500">Date: {props.selectedDayLabel}</Text>
              </View>
              <Pressable onPress={props.onClose}>
                <Text className="text-sm font-semibold text-neutral-600">Close</Text>
              </Pressable>
            </View>

            <Text className="mt-3 text-xs leading-5 text-neutral-600">
              Move funds between two accounts. Saves as a paired pair of transactions (one out, one in).
            </Text>

            <View className="mt-4">
              <Text className="mb-2 text-xs font-semibold text-neutral-700">Amount</Text>
              <TextInput
                className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base"
                value={props.amount}
                onChangeText={props.setAmount}
                keyboardType="decimal-pad"
                placeholder="100"
              />
            </View>

            <View className="mt-4">
              <Text className="mb-2 text-xs font-semibold text-neutral-700">Description (optional)</Text>
              <TextInput
                className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base"
                value={props.desc}
                onChangeText={props.setDesc}
                placeholder="e.g. Move to savings"
              />
            </View>

            <View className="mt-4">
              <Text className="mb-2 text-xs font-semibold text-neutral-700">From account</Text>
              <View className="flex-row flex-wrap gap-2">
                {props.accounts.map((a) => (
                  <Pressable
                    key={a.id}
                    className={a.id === props.fromAccountId ? 'rounded-xl bg-neutral-900 px-3 py-2' : 'rounded-xl bg-neutral-100 px-3 py-2'}
                    onPress={() => props.setFromAccountId(a.id)}
                  >
                    <Text
                      className={a.id === props.fromAccountId ? 'text-xs font-semibold text-white' : 'text-xs font-semibold text-neutral-700'}
                    >
                      {a.name ?? 'Account'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View className="mt-4">
              <Text className="mb-2 text-xs font-semibold text-neutral-700">To account</Text>
              <View className="flex-row flex-wrap gap-2">
                {eligibleTo.map((a) => (
                  <Pressable
                    key={a.id}
                    className={a.id === props.toAccountId ? 'rounded-xl bg-neutral-900 px-3 py-2' : 'rounded-xl bg-neutral-100 px-3 py-2'}
                    onPress={() => props.setToAccountId(a.id)}
                  >
                    <Text
                      className={a.id === props.toAccountId ? 'text-xs font-semibold text-white' : 'text-xs font-semibold text-neutral-700'}
                    >
                      {a.name ?? 'Account'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {props.accounts.length < 2 ? (
                <Text className="mt-2 text-xs text-neutral-500">Add a second account to enable transfers.</Text>
              ) : null}
            </View>

            <Pressable className="mt-5 h-12 items-center justify-center rounded-xl bg-sky-600" onPress={props.onSubmit}>
              <Text className="text-base font-semibold text-white">Save</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

export function confirmClearWhatIf(onConfirm: () => void | Promise<void>) {
  Alert.alert('Clear what-if items?', 'Deletes all what-if transactions for this scope.', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Clear',
      style: 'destructive',
      onPress: () => {
        void Promise.resolve(onConfirm()).catch((e: unknown) =>
          Alert.alert('Could not clear', e instanceof Error ? e.message : 'Unknown error')
        );
      },
    },
  ]);
}
