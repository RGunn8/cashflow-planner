import 'dotenv/config';
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

const openai = new OpenAI({ apiKey: requireEnv('OPENAI_API_KEY') });

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

/**
 * POST /voice/parse
 * multipart/form-data: audio file field named "audio"
 * Response:
 * {
 *   transcript: string,
 *   intent: 'transaction'|'recurring'|'unknown',
 *   transaction?: { description, amount, date, tags? },
 *   recurring?: { kind, name, amount, cadence, monthlyDay?, weeklyDow? }
 * }
 */
app.post('/voice/parse', upload.single('audio'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Missing audio file field "audio"' });

    // 1) Transcribe
    const audioFile = await toFile(file.buffer, file.originalname || 'audio.m4a', {
      type: file.mimetype || 'audio/m4a',
    });

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1',
    });

    const transcript = (transcription?.text || '').trim();
    if (!transcript) return res.json({ transcript: '', intent: 'unknown' });

    // 2) Extract structured intent
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
            date: { type: 'string', description: 'YYYY-MM-DD if specified or implied (today/yesterday/tomorrow). Omit if unknown.' },
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

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_EXTRACT_MODEL || 'gpt-4o-mini',
      temperature: 0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });

    const content = completion.choices?.[0]?.message?.content?.trim() || '';

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      // fallback: still return transcript so app can show error
      return res.json({ transcript, intent: 'unknown' });
    }

    // Force transcript to be our actual transcript.
    parsed.transcript = transcript;

    // Small normalizations
    if (parsed.intent === 'recurring' && parsed.recurring) {
      // Ensure amount positive for recurring payload
      const amt = Number(parsed.recurring.amount);
      if (Number.isFinite(amt)) parsed.recurring.amount = Math.abs(amt);
    }

    return res.json(parsed);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
});

app.listen(port, () => {
  console.log(`voice backend listening on :${port}`);
});
