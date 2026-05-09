import { create } from 'zustand';
import { toIsoDate } from '@/src/utils/dates';

function todayIsoDate() {
  return toIsoDate(new Date());
}

export type PendingRecurringDraft = {
  kind: 'bill' | 'income' | 'transfer' | 'goal';
  name: string;
  amount: number;
  cadence: 'weekly' | 'biweekly' | 'monthly';
  weeklyDow?: number; // 0..6
  monthlyDay?: number; // 1..31
  accountId?: string;
  toAccountId?: string;
};

export type AppState = {
  selectedDay: string; // YYYY-MM-DD
  selectedAccountId: string | null;
  selectedScenarioId: string | null;

  pendingRecurringDraft: PendingRecurringDraft | null;

  /** When true, routing sends users through onboarding after sign-in (see Settings). */
  alwaysShowOnboarding: boolean;

  /**
   * After `setOnboardingComplete`, root layout may still have stale async state until the next
   * storage read. Same-session completion sets this so routing treats onboarding as done immediately.
   */
  sessionOnboardingCompleteUserId: string | null;
  /** Bump so root layout re-reads AsyncStorage after writes. */
  onboardingStorageEpoch: number;

  setSelectedDay: (day: string) => void;
  setSelectedAccountId: (accountId: string | null) => void;
  setSelectedScenarioId: (scenarioId: string | null) => void;

  setPendingRecurringDraft: (draft: PendingRecurringDraft | null) => void;
  setAlwaysShowOnboarding: (value: boolean) => void;

  markSessionOnboardingComplete: (userId: string) => void;
  clearSessionOnboardingComplete: () => void;
  bumpOnboardingStorageEpoch: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  selectedDay: todayIsoDate(),
  selectedAccountId: null,
  selectedScenarioId: null,

  pendingRecurringDraft: null,
  alwaysShowOnboarding: true,

  setSelectedDay: (selectedDay) => set({ selectedDay }),
  setSelectedAccountId: (selectedAccountId) => set({ selectedAccountId }),
  setSelectedScenarioId: (selectedScenarioId) => set({ selectedScenarioId }),

  setPendingRecurringDraft: (pendingRecurringDraft) => set({ pendingRecurringDraft }),
  setAlwaysShowOnboarding: (alwaysShowOnboarding) => set({ alwaysShowOnboarding }),

  sessionOnboardingCompleteUserId: null,
  onboardingStorageEpoch: 0,

  markSessionOnboardingComplete: (userId: string) => set({ sessionOnboardingCompleteUserId: userId }),
  clearSessionOnboardingComplete: () => set({ sessionOnboardingCompleteUserId: null }),
  bumpOnboardingStorageEpoch: () => set((s) => ({ onboardingStorageEpoch: s.onboardingStorageEpoch + 1 })),
}));
