import { computeActualBalancesAsOf } from '@/src/utils/balances';

describe('computeActualBalancesAsOf', () => {
  it('starts from openingBalance, includes non-what-if txns up to cutoff (inclusive), excludes what-if', () => {
    const accounts: any[] = [
      { id: 'a1', openingBalance: 100 },
      { id: 'a2', openingBalance: 50 },
    ];

    const txns: any[] = [
      { id: 't1', accountId: 'a1', postedAt: '2026-05-01T10:00:00.000Z', amount: -10 },
      { id: 't2', accountId: 'a1', postedAt: '2026-05-02T10:00:00.000Z', amount: 25 },
      { id: 't3', accountId: 'a2', postedAt: '2026-05-02T10:00:00.000Z', amount: -5 },
      // what-if should be excluded
      { id: 't4', accountId: 'a2', postedAt: '2026-05-02T10:00:00.000Z', amount: 999, isWhatIf: true },
      // after cutoff should be excluded
      { id: 't5', accountId: 'a1', postedAt: '2026-05-03T00:00:00.000Z', amount: 1000 },
    ];

    const out = computeActualBalancesAsOf({
      accounts: accounts as any,
      transactions: txns as any,
      asOfIsoDateTime: '2026-05-02T10:00:00.000Z',
    });

    expect(out).toEqual({
      a1: 100 - 10 + 25,
      a2: 50 - 5,
    });
  });
});
