// Supabase Edge Function: voice-parse
// Endpoint: POST https://<project-ref>.functions.supabase.co/voice-parse
// Body: multipart/form-data with field "audio" (File)
// Secrets:
// - OPENAI_API_KEY
// Optional:
// - OPENAI_TRANSCRIBE_MODEL (default whisper-1)
// - OPENAI_EXTRACT_MODEL (default gpt-4o-mini)

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
      ...(init.headers ?? {}),
    },
  });
}

function text(body: string, init: ResponseInit = {}) {
  return new Response(body, {
    ...init,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      ...corsHeaders,
      ...(init.headers ?? {}),
    },
  });
}

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

type VoiceIntent = 'transaction' | 'recurring' | 'unknown';

type VoiceParseResponse = {
  transcript: string;
  intent: VoiceIntent;
  transaction?: {
    description?: string;
    amount?: number;
    date?: string;
    tags?: string[];
    accountName?: string;
    accountId?: string;
  };
  recurring?: {
    kind: 'bill' | 'income' | 'transfer' | 'goal';
    name: string;
    amount: number;
    cadence: 'weekly' | 'biweekly' | 'monthly';
    weeklyDow?: number;
    monthlyDay?: number;
    accountId?: string;
    toAccountId?: string;
  };
  requestId?: string;
  timingsMs?: { total: number };
};

async function openaiTranscribe({ apiKey, model, audio }: { apiKey: string; model: string; audio: File }) {
  const fd = new FormData();
  fd.append('file', audio);
  fd.append('model', model);

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: fd,
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`OpenAI transcription failed (${res.status}): ${t || res.statusText}`);
  }

  const json = (await res.json()) as { text?: string };
  return String(json.text ?? '');
}

async function openaiExtract({ apiKey, model, transcript }: { apiKey: string; model: string; transcript: string }) {
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

  const system =
    'You extract structured cashflow actions from a short speech transcript. ' +
    'Return ONLY valid JSON. Do not include markdown.';

  const user =
    `Transcript: ${JSON.stringify(transcript)}\n\n` +
    `Assume today is ${new Date().toISOString().slice(0, 10)}.\n` +
    `Rules:\n` +
    `- If user mentions monthly/weekly/biweekly or "every" or a day-of-month like "on the 1st", interpret as intent=recurring.\n` +
    `- Recurring kind bill vs income: if they say bill/rent/mortgage/utilities/subscription or imply spending, kind=bill. If they say paycheck/salary/income, kind=income.\n` +
    `- For transactions: infer negative amount for spend unless they clearly say income.\n` +
    `- If ambiguous, intent=unknown.\n\n` +
    `Return JSON that matches this JSON Schema:\n${JSON.stringify(schemaHint)}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`OpenAI extract failed (${res.status}): ${t || res.statusText}`);
  }

  const data = (await res.json()) as any;
  const content = String(data?.choices?.[0]?.message?.content ?? '').trim();
  if (!content) return { transcript, intent: 'unknown' };

  try {
    return JSON.parse(content);
  } catch {
    return { transcript, intent: 'unknown' };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (req.method === 'GET') {
    return text('voice-parse edge function. POST multipart/form-data with field "audio".');
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });

  const requestId = crypto.randomUUID();
  const t0 = Date.now();

  try {
    const apiKey = requireEnv('OPENAI_API_KEY');
    const transcribeModel = Deno.env.get('OPENAI_TRANSCRIBE_MODEL') || 'whisper-1';
    const extractModel = Deno.env.get('OPENAI_EXTRACT_MODEL') || 'gpt-4o-mini';

    const ct = req.headers.get('content-type') || '';
    if (!ct.includes('multipart/form-data')) {
      return json({ error: 'Expected multipart/form-data', requestId }, { status: 400 });
    }

    const form = await req.formData();
    const audio = form.get('audio');
    if (!(audio instanceof File)) {
      return json({ error: 'Missing multipart field "audio"', requestId }, { status: 400 });
    }

    const transcript = (await openaiTranscribe({ apiKey, model: transcribeModel, audio })).trim();
    if (!transcript) {
      const total = Date.now() - t0;
      const resp: VoiceParseResponse = { transcript: '', intent: 'unknown', requestId, timingsMs: { total } };
      return json(resp);
    }

    const extracted = await openaiExtract({ apiKey, model: extractModel, transcript });

    const total = Date.now() - t0;
    const resp: VoiceParseResponse = {
      ...(extracted ?? {}),
      transcript,
      requestId,
      timingsMs: { total },
    };

    // Normalize recurring.amount to positive
    if (resp.intent === 'recurring' && resp.recurring && typeof resp.recurring.amount === 'number') {
      resp.recurring.amount = Math.abs(resp.recurring.amount);
    }

    return json(resp);
  } catch (e) {
    const total = Date.now() - t0;
    return json(
      {
        error: (e as any)?.message || 'Unknown error',
        requestId,
        timingsMs: { total },
      },
      { status: 500 }
    );
  }
});
