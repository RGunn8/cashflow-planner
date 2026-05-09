import AsyncStorage from '@react-native-async-storage/async-storage';

const ALWAYS_SHOW_KEY = '@cashflow_always_show_onboarding_v1';

const STORAGE_KEY = (userId: string) => `@cashflow_onboarding_complete_v1_${userId}`;

/**
 * When true (default), the app opens the onboarding flow after sign-in even if the user
 * already completed it — useful for testing. Does not pull users off the calendar mid-session.
 */
export async function getAlwaysShowOnboarding(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(ALWAYS_SHOW_KEY);
    if (v === null) return true;
    return v === '1';
  } catch {
    return true;
  }
}

export async function setAlwaysShowOnboarding(value: boolean) {
  await AsyncStorage.setItem(ALWAYS_SHOW_KEY, value ? '1' : '0');
}

export async function getOnboardingComplete(userId: string): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY(userId));
    return v === '1';
  } catch {
    return false;
  }
}

export async function setOnboardingComplete(userId: string, complete: boolean) {
  await AsyncStorage.setItem(STORAGE_KEY(userId), complete ? '1' : '0');
}
