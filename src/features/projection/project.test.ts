import { projectDays } from '@/src/features/projection/project';

describe('projectDays', () => {
  it('uses openingBalanceByAccountId override and excludes matched scheduled events', () => {
    const accounts: any[] = [
      { id: 'a1', openingBalance: 100 },
      { id: 'a2', openingBalance: 200 },
    ];

    const days = ['2026-05-01', '2026-05-02'];

    const scheduledEvents: any[] = [
      { id: 'e1', userId: 'u', accountId: 'a1', date: '2026-05-01', kind: 'income', amount: 50 },
      { id: 'e2', userId: 'u', accountId: 'a1', date: '2026-05-02', kind: 'bill', amount: -20 },
    ];

    const transactions: any[] = [
      // Matched to e1 so e1 should be excluded from projection
      { id: 't1', userId: 'u', accountId: 'a1', postedAt: '2026-05-01T12:00:00.000Z', amount: 50, matchedEventId: 'e1' },
    ];

    const out = projectDays({
      accounts,
      accountId: 'a1',
      days,
      scheduledEvents,
      transactions,
      openingBalanceByAccountId: { a1: 999 },
    });

    // Day 1: opening override 999, matched event excluded, txn contributes +50
    expect(out['2026-05-01'].startBalance).toBe(999);
    expect(out['2026-05-01'].income).toBe(50);
    expect(out['2026-05-01'].net).toBe(50);
    expect(out['2026-05-01'].endBalance).toBe(1049);

    // Day 2: scheduled bill applies
    expect(out['2026-05-02'].bills).toBe(-20);
    expect(out['2026-05-02'].endBalance).toBe(1029);
  });

  it('buckets what-if goal transactions into goals', () => {
    const accounts: any[] = [{ id: 'a1', openingBalance: 0 }];
    const days = ['2026-05-01'];

    const out = projectDays({
      accounts,
      accountId: 'a1',
      days,
      scheduledEvents: [],
      transactions: [
        { id: 'w1', accountId: 'a1', postedAt: '2026-05-01T12:00:00.000Z', amount: -100, isWhatIf: true, whatIfKind: 'goal' },
      ] as any,
    });

    expect(out['2026-05-01'].goals).toBe(-100);
    expect(out['2026-05-01'].bills).toBe(0);
    expect(out['2026-05-01'].income).toBe(0);
  });
});
