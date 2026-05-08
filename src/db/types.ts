import { InstaQLEntity } from '@instantdb/react-native';

import { schema } from './schema';

export type User = InstaQLEntity<typeof schema, 'users'>;
export type Account = InstaQLEntity<typeof schema, 'accounts'>;
export type RecurringRule = InstaQLEntity<typeof schema, 'recurringRules'>;
export type ScheduledEvent = InstaQLEntity<typeof schema, 'scheduledEvents'>;
export type Transaction = InstaQLEntity<typeof schema, 'transactions'>;
export type Goal = InstaQLEntity<typeof schema, 'goals'>;
export type Scenario = InstaQLEntity<typeof schema, 'scenarios'>;
export type ScenarioEdit = InstaQLEntity<typeof schema, 'scenarioEdits'>;
export type MatchingRule = InstaQLEntity<typeof schema, 'matchingRules'>;

