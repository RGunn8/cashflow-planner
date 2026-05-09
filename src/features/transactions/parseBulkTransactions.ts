/**
 * Split free-form input into segments. Transactions are separated by commas or newlines.
 */
export function splitBulkSegments(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  return normalized
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export type ParsedBulkLine =
  | { ok: true; amount: number; description: string }
  | { ok: false; raw: string; error: string };

/** Matches a currency-ish number: optional $, optional minus, digits + optional decimals */
const AMOUNT_TOKEN = /^-?\$?\s*-?\d+(?:\.\d+)?$/;

function parseAmountToken(tok: string): number | null {
  const cleaned = tok.replace(/\$/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse one segment into amount + description.
 * Supports: "12.50 lunch", "lunch 12.50", "-8 coffee", "$100 rent", "50" (label defaults).
 */
export function parseBulkTransactionLine(segment: string): ParsedBulkLine {
  const s = segment.trim().replace(/\s+/g, ' ');
  if (!s) return { ok: false, raw: segment, error: 'Empty' };

  const parts = s.split(/\s+/);
  if (parts.length === 1) {
    if (AMOUNT_TOKEN.test(parts[0]!)) {
      const amt = parseAmountToken(parts[0]!);
      if (amt !== null) return { ok: true, amount: amt, description: 'Transaction' };
    }
    return { ok: false, raw: segment, error: 'Add an amount (e.g. 12.50 lunch)' };
  }

  const first = parts[0]!;
  const last = parts[parts.length - 1]!;

  if (parseAmountToken(first) !== null && !AMOUNT_TOKEN.test(last)) {
    const amt = parseAmountToken(first)!;
    const description = parts.slice(1).join(' ').trim();
    if (!description) return { ok: false, raw: segment, error: 'Add a description after the amount' };
    return { ok: true, amount: amt, description };
  }

  if (parseAmountToken(last) !== null) {
    const amt = parseAmountToken(last)!;
    const description = parts.slice(0, -1).join(' ').trim();
    if (!description) return { ok: false, raw: segment, error: 'Add a description before the amount' };
    return { ok: true, amount: amt, description };
  }

  return {
    ok: false,
    raw: segment,
    error: 'Include a number for each item (e.g. -25 gas or groceries 42)',
  };
}

export function parseBulkInput(text: string): ParsedBulkLine[] {
  return splitBulkSegments(text).map(parseBulkTransactionLine);
}
