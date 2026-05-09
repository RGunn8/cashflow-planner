/**
 * Cash Calendar — parse backends for AI-assisted imports.
 *
 * Env: OPENAI_API_KEY (required). Optional: PORT (default 8787), OPENAI_VISION_MODEL (default gpt-4o-mini).
 *
 * POST /image/parse-transactions — multipart field `image` (screenshot).
 * POST /text/parse — JSON { text: string } (same helper as screenshot path).
 *
 * Responses: { transactions: { description: string, amount: number, date?: string }[] }
 */
import cors from 'cors';
import express from 'express';
import multer from 'multer';
import OpenAI from 'openai';

const app = express();
const port = Number(process.env.PORT || 8787);

app.use(cors());
app.use(express.json({ limit: '2mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const openaiClient = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You extract banking transactions from user-provided content (screenshot or pasted text).

Rules:
- Return ONLY valid JSON, no markdown, matching this shape: {"transactions":[{"description":"string","amount":number,"date":"YYYY-MM-DD or omit"}]}
- amounts: spending/outflows MUST be negative numbers; deposits/inflows positive (match how US bank apps usually show negatives for debits).
- description: concise merchant or label (omit bank boilerplate row numbers).
- date: include YYYY-MM-DD only when clearly visible per row; otherwise omit (client will fill a default date).
- Skip running balances, headers, totals, pending sections if they are summaries not individual txns.
- If uncertain about a row, skip it rather than hallucinate.`;

async function transactionsFromCompletion(userContent) {
  if (!process.env.OPENAI_API_KEY) {
    const err = new Error('OPENAI_API_KEY not configured');
    err.statusCode = 503;
    throw err;
  }

  const model = process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini';
  const openai = openaiClient();

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? '';
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    const err = new Error('Model did not return valid JSON');
    err.statusCode = 502;
    throw err;
  }

  const list = Array.isArray(json.transactions) ? json.transactions : [];
  const transactions = list
    .map((t) => ({
      description: String(t?.description ?? '').trim(),
      amount: Number(t?.amount),
      date: typeof t?.date === 'string' ? t.date.trim() : undefined,
    }))
    .filter((t) => t.description.length > 0 && Number.isFinite(t.amount))
    .map((t) => ({
      ...t,
      ...(t.date && /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? { date: t.date } : { date: undefined }),
    }));

  return { transactions };
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/text/parse', async (req, res) => {
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text : '';
    if (!text.trim()) {
      res.status(400).json({ error: 'Missing text' });
      return;
    }

    const out = await transactionsFromCompletion([{ type: 'text', text }]);
    res.json(out);
  } catch (e) {
    const status = e.statusCode || 500;
    res.status(status).json({ error: e.message || 'Server error' });
  }
});

app.post('/image/parse-transactions', upload.single('image'), async (req, res) => {
  try {
    const file = req.file;
    if (!file?.buffer?.length) {
      res.status(400).json({ error: 'Missing image multipart field named "image"' });
      return;
    }

    const mime = file.mimetype || 'image/jpeg';
    const b64 = file.buffer.toString('base64');
    const url = `data:${mime};base64,${b64}`;

    const out = await transactionsFromCompletion([
      {
        type: 'text',
        text: 'Extract all individual transactions from this account activity screenshot.',
      },
      { type: 'image_url', image_url: { url } },
    ]);

    res.json(out);
  } catch (e) {
    const status = e.statusCode || 500;
    res.status(status).json({ error: e.message || 'Server error' });
  }
});

app.listen(port, () => {
  console.log(`Cashflow parse server on http://127.0.0.1:${port}`);
});
