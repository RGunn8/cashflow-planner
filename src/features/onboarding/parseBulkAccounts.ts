import { splitBulkSegments } from '@/src/features/transactions/parseBulkTransactions';

export type ParsedAccountLine =
  | { ok: true; name: string; openingBalance: number }
  | { ok: false; raw: string; error: string };

const AMOUNT_TOKEN = /^\$?\s*\d+(?:\.\d+)?$/;

function parseAmountToken(tok: string): number | null {
  const cleaned = tok.replace(/\$/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** One line: "2500 Checking" or "Main checking 1200.50" */
export function parseBulkAccountLine(segment: string): ParsedAccountLine {
  const s = segment.trim().replace(/\s+/g, ' ');
  if (!s) return { ok: false, raw: segment, error: 'Empty' };

  const parts = s.split(/\s+/);
  if (parts.length === 1) {
    return { ok: false, raw: segment, error: 'Include a name and opening balance (e.g. 2500 Checking)' };
  }

  const first = parts[0]!;
  const last = parts[parts.length - 1]!;

  if (parseAmountToken(first) !== null && !AMOUNT_TOKEN.test(last)) {
    const openingBalance = Math.abs(parseAmountToken(first)!);
    const name = parts.slice(1).join(' ').trim();
    if (!name) return { ok: false, raw: segment, error: 'Add an account name after the balance' };
    return { ok: true, name, openingBalance };
  }

  if (parseAmountToken(last) !== null) {
    const openingBalance = Math.abs(parseAmountToken(last)!);
    const name = parts.slice(0, -1).join(' ').trim();
    if (!name) return { ok: false, raw: segment, error: 'Add an account name before the balance' };
    return { ok: true, name, openingBalance };
  }

  return {
    ok: false,
    raw: segment,
    error: 'Include a balance number (e.g. Chase checking 1500)',
  };
}

export function parseBulkAccountsInput(text: string): ParsedAccountLine[] {
  return splitBulkSegments(text).map(parseBulkAccountLine);
}
