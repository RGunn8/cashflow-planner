import React from 'react';
import { Text, View } from 'react-native';

export function InstantSetupScreen() {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <Text className="text-xl font-semibold text-neutral-900">Connect InstantDB</Text>
      <Text className="mt-2 text-center text-neutral-600">
        Add <Text className="font-mono font-semibold text-neutral-800">EXPO_PUBLIC_INSTANT_APP_ID</Text> to your environment and restart the
        dev server.
      </Text>
    </View>
  );
}
