import 'react-native-gesture-handler';
import '../global.css';

import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useColorScheme } from '@/components/useColorScheme';
import { db, isInstantConfigured } from '@/src/db/instant';
import { InstantSetupScreen } from '@/src/features/setup/InstantSetupScreen';
import { AppProviders } from '@/src/providers/AppProviders';
import { getAlwaysShowOnboarding, getOnboardingComplete } from '@/src/state/onboardingStorage';
import { useAppStore } from '@/src/state/useAppStore';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();
  const segment0 = segments[0];

  const auth = db?.useAuth?.();

  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  const alwaysShowOnboarding = useAppStore((s) => s.alwaysShowOnboarding);
  const setAlwaysShowOnboarding = useAppStore((s) => s.setAlwaysShowOnboarding);
  const sessionOnboardingUid = useAppStore((s) => s.sessionOnboardingCompleteUserId);
  const onboardingStorageEpoch = useAppStore((s) => s.onboardingStorageEpoch);
  const clearSessionOnboardingComplete = useAppStore((s) => s.clearSessionOnboardingComplete);

  useEffect(() => {
    let c = false;
    getAlwaysShowOnboarding().then((v) => {
      if (!c) setAlwaysShowOnboarding(v);
    });
    return () => {
      c = true;
    };
  }, [setAlwaysShowOnboarding]);

  useEffect(() => {
    const uid = auth?.user?.id as string | undefined;
    if (!uid) {
      setOnboardingDone(null);
      clearSessionOnboardingComplete();
      return;
    }
    const sessionUid = useAppStore.getState().sessionOnboardingCompleteUserId;
    if (sessionUid !== null && sessionUid !== uid) {
      clearSessionOnboardingComplete();
    }
    let cancelled = false;
    getOnboardingComplete(uid).then((v) => {
      if (!cancelled) setOnboardingDone(v);
    });
    return () => {
      cancelled = true;
    };
  }, [auth?.user?.id, onboardingStorageEpoch, clearSessionOnboardingComplete]);

  useEffect(() => {
    if (!isInstantConfigured || !db) return;
    if (!auth || auth.isLoading) return;
    if (auth.user?.id && onboardingDone === null) return;

    const inAuthGroup = segment0 === '(auth)';
    const inOnboarding = segment0 === '(onboarding)';
    const isSignedIn = Boolean(auth.user);

    const uid = auth.user?.id as string | undefined;
    const onboardingComplete =
      onboardingDone === true ||
      (Boolean(uid) && sessionOnboardingUid === uid);

    const sendToTabsAfterSignIn = !alwaysShowOnboarding && onboardingComplete;

    if (!isSignedIn && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (isSignedIn && inAuthGroup) {
      router.replace(sendToTabsAfterSignIn ? '/(tabs)' : '/(onboarding)');
    } else if (isSignedIn && !onboardingComplete && !inOnboarding && !inAuthGroup) {
      router.replace('/(onboarding)');
    } else if (
      isSignedIn &&
      onboardingComplete &&
      inOnboarding &&
      !alwaysShowOnboarding
    ) {
      router.replace('/(tabs)');
    }
  }, [
    auth?.isLoading,
    auth?.user,
    router,
    segment0,
    onboardingDone,
    alwaysShowOnboarding,
    sessionOnboardingUid,
  ]);

  useEffect(() => {
    if (!isInstantConfigured || !db) return;
    if (!auth || auth.isLoading) return;
    if (!auth.user?.id) return;

    // Ensure there's a `users` row for the signed-in user.
    // This lets the rest of the app query by `userId` immediately after login.
    const userId = auth.user.id as string;
    const email = (auth.user as any)?.email ?? '';
    const createdAt = new Date().toISOString();

    db.transact([db.tx.users[userId].update({ email, createdAt })]).catch(() => {
      // Best-effort; auth + routing should still work if this fails.
    });
  }, [auth?.isLoading, auth?.user?.id]);

  if (!isInstantConfigured || !db) {
    return <InstantSetupScreen />;
  }

  return (
    <AppProviders>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <GestureHandlerRootView className="flex-1">
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
          </Stack>
        </GestureHandlerRootView>
      </ThemeProvider>
    </AppProviders>
  );
}
