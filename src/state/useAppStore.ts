import { create } from 'zustand';

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
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

  setSelectedDay: (day: string) => void;
  setSelectedAccountId: (accountId: string | null) => void;
  setSelectedScenarioId: (scenarioId: string | null) => void;

  setPendingRecurringDraft: (draft: PendingRecurringDraft | null) => void;
};

export const useAppStore = create<AppState>((set) => ({
  selectedDay: todayIsoDate(),
  selectedAccountId: null,
  selectedScenarioId: null,

  pendingRecurringDraft: null,

  setSelectedDay: (selectedDay) => set({ selectedDay }),
  setSelectedAccountId: (selectedAccountId) => set({ selectedAccountId }),
  setSelectedScenarioId: (selectedScenarioId) => set({ selectedScenarioId }),

  setPendingRecurringDraft: (pendingRecurringDraft) => set({ pendingRecurringDraft }),
}));
