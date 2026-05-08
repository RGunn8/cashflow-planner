import React from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { db } from '@/src/db/instant';

export default function SettingsScreen() {
  return (
    <View className="flex-1 bg-neutral-100">
      <View className="px-4 pb-3 pt-14">
        <Text className="text-lg font-semibold text-neutral-900">Settings</Text>
      </View>
      <View className="flex-1 rounded-t-3xl bg-white px-4 py-4">
        <Pressable
          className="h-12 items-center justify-center rounded-xl bg-neutral-900"
          onPress={async () => {
            try {
              await db?.auth?.signOut?.();
            } catch (e: any) {
              Alert.alert('Could not sign out', e?.message ?? 'Unknown error');
            }
          }}
        >
          <Text className="text-base font-semibold text-white">Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}
