import React, { useMemo } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

function tagInputPrefixAndCurrent(value: string): { head: string; current: string } {
  const i = value.lastIndexOf(',');
  if (i === -1) return { head: '', current: value };
  return { head: value.slice(0, i + 1), current: value.slice(i + 1) };
}

function completedTagKeysBeforeLastComma(value: string): Set<string> {
  const i = value.lastIndexOf(',');
  const segment = i === -1 ? '' : value.slice(0, i);
  return new Set(
    segment
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function TagAutocompleteField(props: {
  value: string;
  onChangeText: (v: string) => void;
  knownTags: string[];
}) {
  const { head, current } = tagInputPrefixAndCurrent(props.value);
  const completed = useMemo(() => completedTagKeysBeforeLastComma(props.value), [props.value]);

  const suggestions = useMemo(() => {
    const q = current.trim().toLowerCase();
    if (!q) return [];
    const pool = props.knownTags.filter((t) => !completed.has(t.toLowerCase()));
    return pool.filter((t) => t.toLowerCase().startsWith(q)).slice(0, 8);
  }, [current, completed, props.knownTags]);

  const showList = suggestions.length > 0 && current.trim().length > 0;

  function applySuggestion(suggestion: string) {
    const next = head ? `${head}${suggestion}, ` : `${suggestion}, `;
    props.onChangeText(next);
  }

  return (
    <View>
      <TextInput
        className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base"
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder="e.g. groceries, eating out"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {showList ? (
        <View className="mt-1 overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <ScrollView className="max-h-40" keyboardShouldPersistTaps="handled">
            {suggestions.map((s) => (
              <Pressable
                key={s}
                className="border-b border-neutral-100 px-4 py-2.5 active:bg-neutral-50"
                onPress={() => applySuggestion(s)}
              >
                <Text className="text-sm text-neutral-900">{s}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
