export const qk = {
  auth: () => ['auth'] as const,
  accounts: (userId: string) => ['accounts', userId] as const,
  recurringRules: (userId: string, accountId?: string) => ['recurringRules', userId, accountId ?? 'all'] as const,
  scheduledEvents: (userId: string, rangeKey: string, accountId?: string, scenarioId?: string) =>
    ['scheduledEvents', userId, rangeKey, accountId ?? 'all', scenarioId ?? 'base'] as const,
  transactions: (userId: string, rangeKey: string, accountId?: string) => ['transactions', userId, rangeKey, accountId ?? 'all'] as const,
  transactionTags: (userId: string) => ['transactionTags', userId] as const,
  whatIfTransactions: (userId: string, scenarioId?: string | null) =>
    ['whatIfTransactions', userId, scenarioId ?? 'base'] as const,
  goals: (userId: string) => ['goals', userId] as const,
  scenarios: (userId: string) => ['scenarios', userId] as const,
  scenarioEdits: (scenarioId: string) => ['scenarioEdits', scenarioId] as const,
};
