import 'react-native-gesture-handler';
import '../global.css';

import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useColorScheme } from '@/components/useColorScheme';
import { db, isInstantConfigured } from '@/src/db/instant';
import { InstantSetupScreen } from '@/src/features/setup/InstantSetupScreen';
import { AppProviders } from '@/src/providers/AppProviders';

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

  useEffect(() => {
    if (!isInstantConfigured || !db) return;
    if (!auth || auth.isLoading) return;

    const inAuthGroup = segment0 === '(auth)';
    const isSignedIn = Boolean(auth.user);

    if (!isSignedIn && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (isSignedIn && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [auth?.isLoading, auth?.user, router, segment0]);

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
            <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
          </Stack>
        </GestureHandlerRootView>
      </ThemeProvider>
    </AppProviders>
  );
}
