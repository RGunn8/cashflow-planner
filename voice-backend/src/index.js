import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { OpenAI } from 'openai';
import { toFile } from 'openai/uploads';

const app = express();
app.use(cors());

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
  maxRetries: Number(process.env.OPENAI_MAX_RETRIES || 4),
  timeout: Number(process.env.OPENAI_TIMEOUT_MS || 60000),
});

async function withConnResetRetries(fn, { retries = 2, baseDelayMs = 400 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const code = e?.cause?.code || e?.code;
      const msg = String(e?.message || '');
      const isConnReset = code === 'ECONNRESET' || msg.includes('APIConnectionError') || msg.includes('ECONNRESET');
      if (!isConnReset || attempt >= retries) throw e;
      const delay = baseDelayMs * 2 ** attempt;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/', (_req, res) => {
  res
    .status(200)
    .type('text/plain')
    .send('cashflow voice backend: POST /voice/parse (multipart form-data field "audio"), GET /health');
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
    return res.status(500).json({
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
