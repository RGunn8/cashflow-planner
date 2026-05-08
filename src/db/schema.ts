import { i } from '@instantdb/react-native';

export const schema = i.schema({
  entities: {
    users: i.entity({
      email: i.string(),
      createdAt: i.string(),
    }),
    accounts: i.entity({
      userId: i.string(),
      name: i.string(),
      institution: i.string().optional(),
      type: i.string(),
      currency: i.string(),
      openingBalance: i.number(),
      timezone: i.string(),
      /** Hex color used to visually identify this account in calendar + activity (e.g. "#16a34a"). */
      color: i.string().optional(),
    }),
    recurringRules: i.entity({
      userId: i.string(),
      accountId: i.string(),
      kind: i.string(), // 'income' | 'bill' | 'transfer' | 'goal'
      name: i.string(),
      amount: i.number(),
      cadence: i.string(),
      startDate: i.string(),
      endDate: i.string().optional(),
      nextRunAt: i.string(),
      category: i.string().optional(),
      autopay: i.boolean().optional(),
      priority: i.number().optional(),
    }),
    scheduledEvents: i.entity({
      userId: i.string(),
      accountId: i.string(),
      ruleId: i.string().optional(),
      date: i.string().indexed(),
      amount: i.number(),
      kind: i.string(), // 'income' | 'bill' | 'goal' | 'transfer'
      status: i.string(), // 'scheduled' | 'matched' | 'skipped'
    }),
    transactions: i.entity({
      userId: i.string(),
      accountId: i.string(),
      postedAt: i.string().indexed(),
      amount: i.number(),
      description: i.string(),
      tags: i.json().optional(), // string[]
      isWhatIf: i.boolean().optional().indexed(),
      /** Optional scenario id for what-if transactions. Null/undefined = base plan overlay. */
      scenarioId: i.string().optional().indexed(),
      /** When isWhatIf: 'income' | 'bill' | 'goal' — drives home grouping + projection bucket */
      whatIfKind: i.string().optional(),
      matchStatus: i.string().optional(),
      matchedEventId: i.string().optional(),
    }),
    goals: i.entity({
      userId: i.string(),
      name: i.string(),
      /** 'target' (amount by date) | 'recurring' (open-ended monthly contribution). */
      goalType: i.string().optional(),
      /** For target goals. */
      targetAmount: i.number().optional(),
      /** For target goals. */
      targetDate: i.string().optional(),
      /** For recurring goals (monthly commitment). */
      recurringAmount: i.number().optional(),
      /** For recurring goals: day-of-month to schedule (1-31). */
      recurringDay: i.number().optional(),
      /** Optional: where contributions are sourced from / tracked against. */
      accountId: i.string().optional(),
      strategy: i.string().optional(),
      createdAt: i.string(),
      /** Progress already made toward this goal at creation. */
      startingBalance: i.number().optional(),
      /** Optional: earmark an amount from a funding account. */
      fundingAccountId: i.string().optional(),
      fundingAmount: i.number().optional(),
      /** Optional: recurring rule id used to materialize scheduled goal contributions. */
      recurringRuleId: i.string().optional(),
      /**
       * Optional: per-month plan overrides for the goal path.
       * Shape: { [isoDate: string]: number } where isoDate is the scheduled contribution date (YYYY-MM-DD).
       */
      planOverrides: i.json().optional(),
    }),
    scenarios: i.entity({
      userId: i.string(),
      name: i.string(),
      createdAt: i.string(),
    }),
    scenarioEdits: i.entity({
      scenarioId: i.string(),
      type: i.string(),
      refId: i.string().optional(),
      payload: i.json(),
    }),
    matchingRules: i.entity({
      userId: i.string(),
      accountId: i.string().optional(),
      pattern: i.string(),
      matchToRuleId: i.string().optional(),
      confidence: i.number().optional(),
    }),
  },
});
