import { collectTagsFromTransactions, filterTransactions } from '@/src/features/transactions/transactionFilter';

describe('transactionFilter', () => {
  const txns: any[] = [
    {
      id: 't1',
      postedAt: '2026-05-01T12:00:00.000Z',
      description: 'Coffee',
      amount: -5,
      tags: ['food', 'coffee'],
    },
    {
      id: 't2',
      postedAt: '2026-05-02T12:00:00.000Z',
      description: 'Paycheck',
      amount: 1000,
      tags: ['income'],
    },
    {
      id: 't3',
      postedAt: '2026-05-03T12:00:00.000Z',
      description: 'Rent',
      amount: -1200,
      tags: [],
    },
  ];

  it('collectTagsFromTransactions returns unique sorted tags', () => {
    expect(collectTagsFromTransactions(txns as any)).toEqual(['coffee', 'food', 'income']);
  });

  it('filterTransactions matches by search and OR-tags', () => {
    const selected = new Set(['income', 'coffee']);
    const res = filterTransactions(txns as any, 'pay', selected);
    expect(res.map((t) => t.id)).toEqual(['t2']);

    const res2 = filterTransactions(txns as any, '', new Set(['coffee']));
    expect(res2.map((t) => t.id)).toEqual(['t1']);

    const res3 = filterTransactions(txns as any, '2026-05-03', new Set());
    expect(res3.map((t) => t.id)).toEqual(['t3']);
  });
});
