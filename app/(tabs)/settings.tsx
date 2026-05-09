import React, { useEffect } from 'react';
import { Alert, Pressable, Switch, Text, View } from 'react-native';

import { db } from '@/src/db/instant';
import { getAlwaysShowOnboarding, setAlwaysShowOnboarding as persistAlwaysShowOnboarding } from '@/src/state/onboardingStorage';
import { useAppStore } from '@/src/state/useAppStore';

export default function SettingsScreen() {
  const alwaysShowOnboarding = useAppStore((s) => s.alwaysShowOnboarding);
  const setAlwaysShowOnboarding = useAppStore((s) => s.setAlwaysShowOnboarding);

  useEffect(() => {
    getAlwaysShowOnboarding().then(setAlwaysShowOnboarding);
  }, [setAlwaysShowOnboarding]);

  return (
    <View className="flex-1 bg-neutral-100">
      <View className="px-4 pb-3 pt-14">
        <Text className="text-lg font-semibold text-neutral-900">Settings</Text>
      </View>
      <View className="flex-1 rounded-t-3xl bg-white px-4 py-4">
        <View className="mb-4 flex-row items-center justify-between rounded-xl border border-neutral-100 bg-neutral-50 px-4 py-3">
          <View className="mr-3 flex-1">
            <Text className="text-sm font-semibold text-neutral-900">Show onboarding after sign-in</Text>
            <Text className="mt-1 text-xs leading-4 text-neutral-500">
              When on, you always enter the setup flow after logging in (for testing). Default is on for now.
            </Text>
          </View>
          <Switch
            value={alwaysShowOnboarding}
            onValueChange={(v) => {
              setAlwaysShowOnboarding(v);
              void persistAlwaysShowOnboarding(v);
            }}
          />
        </View>
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
