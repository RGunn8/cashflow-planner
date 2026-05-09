import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { OpenAI } from 'openai';
import { toFile } from 'openai/uploads';

const app = express();
app.use(cors());
app.use(express.json({ limit: '512kb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB
  },
});

const port = process.env.PORT || 8787;

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const openai = new OpenAI({
  apiKey: requireEnv('OPENAI_API_KEY'),
  // Render/free-tier networking can occasionally reset connections.
  // Let the SDK retry transient failures and allow a bit more time.
  maxRetries: Number(process.env.OPENAI_MAX_RETRIES || 6),
  timeout: Number(process.env.OPENAI_TIMEOUT_MS || 90000),
});

/** Shared JSON shape for /text/parse and /image/parse-transactions responses. */
const TRANSACTION_EXTRACT_SCHEMA_HINT = {
  type: 'object',
  additionalProperties: false,
  required: ['transactions'],
  properties: {
    transactions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['description', 'amount'],
        properties: {
          description: { type: 'string' },
          amount: {
            type: 'number',
            description: 'Signed USD. Spending/bills negative; income/deposits positive.',
          },
          date: {
            type: 'string',
            description: 'Optional YYYY-MM-DD if the line implies a specific day.',
          },
        },
      },
    },
  },
};

function isTransientNetworkError(e) {
  const code = e?.cause?.code || e?.code;
  const msg = String(e?.message || '');
  // Common transient network errors on Render / Node fetch:
  return (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'EAI_AGAIN' ||
    code === 'ENOTFOUND' ||
    msg.includes('APIConnectionError') ||
    msg.includes('ECONNRESET') ||
    msg.includes('socket hang up') ||
    msg.includes('undici') // undici often wraps as TypeError w/ cause
  );
}

async function withConnResetRetries(fn, { retries = 4, baseDelayMs = 400 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isTransientNetworkError(e) || attempt >= retries) throw e;
      const delay = baseDelayMs * 2 ** attempt;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

process.on('unhandledRejection', (e) => {
  console.error('[voice] unhandledRejection', e);
});

process.on('uncaughtException', (e) => {
  console.error('[voice] uncaughtException', e);
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/', (_req, res) => {
  res
    .status(200)
    .type('text/plain')
    .send(
      'cashflow backend: POST /voice/parse (multipart "audio"), POST /text/parse (JSON { text }), POST /image/parse-transactions (multipart "image"), GET /health'
    );
});

/**
 * POST /text/parse
 * JSON body: { text: string }
 * Uses OpenAI to turn messy notes into structured transactions.
 */
app.post('/text/parse', async (req, res) => {
  const requestId = crypto.randomUUID();
  const t0 = Date.now();
  const log = (msg, extra) => {
    const dt = Date.now() - t0;
    const suffix = extra ? ` ${JSON.stringify(extra)}` : '';
    console.log(`[text:${requestId}] +${dt}ms ${msg}${suffix}`);
  };

  let stage = 'start';

  try {
    const raw = req.body?.text;
    const text = typeof raw === 'string' ? raw.trim() : '';
    if (!text) {
      return res.status(400).json({ error: 'Missing or empty "text" string', requestId });
    }
    if (text.length > 12000) {
      return res.status(400).json({ error: 'Text too long (max 12000 characters)', requestId });
    }

    log('request', { chars: text.length });

    const system =
      'You convert unstructured financial notes into structured transaction rows. ' +
      'Return ONLY valid JSON. No markdown, no commentary. ' +
      'Infer signed amounts: purchases and bills are negative; income is positive.';

    const user =
      `Today is ${new Date().toISOString().slice(0, 10)}.\n\n` +
      `User notes:\n${JSON.stringify(text)}\n\n` +
      `Extract every distinct transaction you can. Skip header lines or totals if they duplicate line items. ` +
      `If the currency is unclear, assume USD.\n\n` +
      `Return JSON matching this schema:\n${JSON.stringify(TRANSACTION_EXTRACT_SCHEMA_HINT)}`;

    stage = 'extract_call';
    log('openai:start');
    const completion = await withConnResetRetries(() =>
      openai.chat.completions.create({
        model: process.env.OPENAI_TEXT_PARSE_MODEL || process.env.OPENAI_EXTRACT_MODEL || 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      })
    );
    log('openai:done');

    stage = 'extract_parse';
    const content = completion.choices?.[0]?.message?.content?.trim() || '';
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      log('json_parse_failed', { sample: content.slice(0, 160) });
      return res.status(502).json({
        error: 'Model returned non-JSON',
        requestId,
        timingsMs: { total: Date.now() - t0 },
      });
    }

    const rows = Array.isArray(parsed?.transactions) ? parsed.transactions : [];
    const transactions = rows
      .map((row) => ({
        description: String(row?.description ?? '').trim() || 'Transaction',
        amount: Number(row?.amount),
        ...(typeof row?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? { date: row.date } : {}),
      }))
      .filter((row) => Number.isFinite(row.amount));

    const total = Date.now() - t0;
    log('success', { count: transactions.length, totalMs: total });

    return res.json({
      transactions,
      requestId,
      timingsMs: { total },
    });
  } catch (e) {
    const total = Date.now() - t0;
    const code = e?.cause?.code || e?.code;
    log('error', { stage, code, message: String(e?.message || ''), totalMs: total });
    console.error(e);
    const isTransient = isTransientNetworkError(e);
    return res.status(isTransient ? 503 : 500).json({
      error: e?.message || 'Unknown error',
      code,
      stage,
      requestId,
      timingsMs: { total },
    });
  }
});

/**
 * POST /image/parse-transactions
 * multipart/form-data: image field named "image" (bank activity screenshot).
 */
app.post('/image/parse-transactions', upload.single('image'), async (req, res) => {
  const requestId = crypto.randomUUID();
  const t0 = Date.now();
  const log = (msg, extra) => {
    const dt = Date.now() - t0;
    const suffix = extra ? ` ${JSON.stringify(extra)}` : '';
    console.log(`[image:${requestId}] +${dt}ms ${msg}${suffix}`);
  };

  let stage = 'start';

  try {
    const file = req.file;
    if (!file?.buffer?.length) {
      return res.status(400).json({ error: 'Missing image multipart field "image"', requestId });
    }

    log('request', {
      bytes: file.size,
      mime: file.mimetype,
      name: file.originalname,
    });

    const mime = file.mimetype || 'image/jpeg';
    const b64 = file.buffer.toString('base64');
    const dataUrl = `data:${mime};base64,${b64}`;

    const system =
      'You extract banking transactions from screenshots of account activity. ' +
      'Return ONLY valid JSON. No markdown, no commentary. ' +
      'Signed amounts in USD: debits and purchases negative; deposits and refunds positive. ' +
      'Skip headers, totals/summary-only rows, and running balances unless they are clearly a distinct transaction line.';

    const userLines = [
      `Today is ${new Date().toISOString().slice(0, 10)}.`,
      '',
      'Extract every distinct transaction row visible in the image.',
      'Include date (YYYY-MM-DD) per row only when clearly shown for that row; otherwise omit.',
      '',
      `Return JSON matching this schema:\n${JSON.stringify(TRANSACTION_EXTRACT_SCHEMA_HINT)}`,
    ];

    stage = 'vision_call';
    log('openai:start');
    const completion = await withConnResetRetries(() =>
      openai.chat.completions.create({
        model: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_TEXT_PARSE_MODEL || 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: [
              { type: 'text', text: userLines.join('\n') },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      })
    );
    log('openai:done');

    stage = 'vision_parse';
    const content = completion.choices?.[0]?.message?.content?.trim() || '';
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      log('json_parse_failed', { sample: content.slice(0, 160) });
      return res.status(502).json({
        error: 'Model returned non-JSON',
        requestId,
        timingsMs: { total: Date.now() - t0 },
      });
    }

    const rows = Array.isArray(parsed?.transactions) ? parsed.transactions : [];
    const transactions = rows
      .map((row) => ({
        description: String(row?.description ?? '').trim() || 'Transaction',
        amount: Number(row?.amount),
        ...(typeof row?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? { date: row.date } : {}),
      }))
      .filter((row) => Number.isFinite(row.amount));

    const total = Date.now() - t0;
    log('success', { count: transactions.length, totalMs: total });

    return res.json({
      transactions,
      requestId,
      timingsMs: { total },
    });
  } catch (e) {
    const total = Date.now() - t0;
    const code = e?.cause?.code || e?.code;
    log('error', { stage, code, message: String(e?.message || ''), totalMs: total });
    console.error(e);
    const isTransient = isTransientNetworkError(e);
    return res.status(isTransient ? 503 : 500).json({
      error: e?.message || 'Unknown error',
      code,
      stage,
      requestId,
      timingsMs: { total },
    });
  }
});

/**
 * POST /voice/parse
 * multipart/form-data: audio file field named "audio"
 */
app.post('/voice/parse', upload.single('audio'), async (req, res) => {
  const requestId = crypto.randomUUID();
  const t0 = Date.now();

  const log = (msg, extra) => {
    const dt = Date.now() - t0;
    const suffix = extra ? ` ${JSON.stringify(extra)}` : '';
    console.log(`[voice:${requestId}] +${dt}ms ${msg}${suffix}`);
  };

  let stage = 'start';

  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Missing audio file field "audio"', requestId });

    log('request received', {
      bytes: file.size,
      mime: file.mimetype,
      name: file.originalname,
    });

    // 1) Transcribe
    stage = 'transcription_prepare';
    log('transcription:prepare');
    const audioFile = await toFile(file.buffer, file.originalname || 'audio.m4a', {
      type: file.mimetype || 'audio/m4a',
    });

    stage = 'transcription_call';
    log('transcription:start');
    const transcription = await withConnResetRetries(() =>
      openai.audio.transcriptions.create({
        file: audioFile,
        model: process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1',
      })
    );
    log('transcription:done');

    const transcript = (transcription?.text || '').trim();
    log('transcription:text', { chars: transcript.length });
    if (!transcript) return res.json({ transcript: '', intent: 'unknown', requestId, timingsMs: { total: Date.now() - t0 } });

    // 2) Extract structured intent
    stage = 'extract_prepare';
    log('extract:prepare');
    const system =
      'You extract structured cashflow actions from a short speech transcript. ' +
      'Return ONLY valid JSON. Do not include markdown.';

    const schemaHint = {
      type: 'object',
      additionalProperties: false,
      required: ['intent', 'transcript'],
      properties: {
        transcript: { type: 'string' },
        intent: { type: 'string', enum: ['transaction', 'recurring', 'unknown'] },
        transaction: {
          type: 'object',
          additionalProperties: false,
          properties: {
            description: { type: 'string' },
            amount: { type: 'number', description: 'Signed. Bills/spend should be negative.' },
            date: {
              type: 'string',
              description: 'YYYY-MM-DD if specified or implied (today/yesterday/tomorrow). Omit if unknown.',
            },
            tags: { type: 'array', items: { type: 'string' } },
          },
        },
        recurring: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'name', 'amount', 'cadence'],
          properties: {
            kind: { type: 'string', enum: ['bill', 'income', 'transfer', 'goal'] },
            name: { type: 'string' },
            amount: { type: 'number', description: 'Positive number; app will treat bill vs income by kind.' },
            cadence: { type: 'string', enum: ['weekly', 'biweekly', 'monthly'] },
            weeklyDow: { type: 'number', description: '0=Sun..6=Sat (only for weekly/biweekly)' },
            monthlyDay: { type: 'number', description: '1..31 (only for monthly)' },
          },
        },
      },
    };

    const user =
      `Transcript: ${JSON.stringify(transcript)}\n\n` +
      `Assume today is ${new Date().toISOString().slice(0, 10)}.\n` +
      `Rules:\n` +
      `- If user mentions monthly/weekly/biweekly or "every" or a day-of-month like "on the 1st", interpret as intent=recurring.\n` +
      `- Recurring kind bill vs income: if they say bill/rent/mortgage/utilities/subscription or imply spending, kind=bill. If they say paycheck/salary/income, kind=income.\n` +
      `- For transactions: infer negative amount for spend unless they clearly say income.\n` +
      `- If ambiguous, intent=unknown.\n\n` +
      `Return JSON that matches this JSON Schema:\n${JSON.stringify(schemaHint)}`;

    stage = 'extract_call';
    log('extract:start');
    const completion = await withConnResetRetries(() =>
      openai.chat.completions.create({
        model: process.env.OPENAI_EXTRACT_MODEL || 'gpt-4o-mini',
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      })
    );
    log('extract:done');

    stage = 'extract_parse';
    const content = completion.choices?.[0]?.message?.content?.trim() || '';

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      log('extract:json_parse_failed', { sample: content.slice(0, 120) });
      return res.json({ transcript, intent: 'unknown', requestId, timingsMs: { total: Date.now() - t0 } });
    }

    parsed.transcript = transcript;
    parsed.requestId = requestId;

    if (parsed.intent === 'recurring' && parsed.recurring) {
      const amt = Number(parsed.recurring.amount);
      if (Number.isFinite(amt)) parsed.recurring.amount = Math.abs(amt);
    }

    const total = Date.now() - t0;
    log('success', { totalMs: total });

    parsed.timingsMs = {
      total,
    };

    return res.json(parsed);
  } catch (e) {
    const total = Date.now() - t0;
    const code = e?.cause?.code || e?.code;
    log('error', {
      stage,
      code,
      message: String(e?.message || ''),
      totalMs: total,
    });
    console.error(e);
    const isTransient = isTransientNetworkError(e);
    return res.status(isTransient ? 503 : 500).json({
      error: e?.message || 'Unknown error',
      code,
      stage,
      requestId,
      timingsMs: { total },
    });
  }
});

app.listen(port, () => {
  console.log(`voice backend listening on :${port}`);
});
