// Supabase Edge Function: image
// Called by app as: POST https://<project-ref>.functions.supabase.co/image/parse-transactions
// Body: multipart/form-data with field "image" (File)
// Secrets: OPENAI_API_KEY (required), OPENAI_VISION_MODEL (optional, default gpt-4o-mini)

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

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const SYSTEM_PROMPT = `You extract banking transactions from user-provided content (screenshot or pasted text).

Rules:
- Return ONLY valid JSON, no markdown, matching this shape: {"transactions":[{"description":"string","amount":number,"date":"YYYY-MM-DD or omit"}]}
- amounts: spending/outflows MUST be negative numbers; deposits/inflows positive.
- description: concise merchant or label.
- date: include YYYY-MM-DD only when clearly visible per row; otherwise omit.
- Skip running balances, headers, totals, pending sections if they are summaries not individual txns.
- If uncertain about a row, skip it rather than hallucinate.`;

async function completionToTransactions({ apiKey, model, userContent }: { apiKey: string; model: string; userContent: any[] }) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`OpenAI completion failed (${res.status}): ${t || res.statusText}`);
  }

  const data = (await res.json()) as any;
  const raw = String(data?.choices?.[0]?.message?.content ?? '');

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Model did not return valid JSON');
  }

  const list = Array.isArray(parsed.transactions) ? parsed.transactions : [];
  const transactions = list
    .map((t: any) => ({
      description: String(t?.description ?? '').trim(),
      amount: Number(t?.amount),
      date: typeof t?.date === 'string' ? t.date.trim() : undefined,
    }))
    .filter((t: any) => t.description.length > 0 && Number.isFinite(t.amount))
    .map((t: any) => ({
      ...t,
      ...(t.date && /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? { date: t.date } : { date: undefined }),
    }));

  return { transactions };
}

async function fileToDataUrl(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const b64 = btoa(String.fromCharCode(...buf));
  const mime = file.type || 'image/jpeg';
  return `data:${mime};base64,${b64}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  // Expect /parse-transactions
  if (url.pathname.endsWith('/parse-transactions') === false) {
    return json({ error: 'Not found' }, { status: 404 });
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });

  const requestId = crypto.randomUUID();
  const t0 = Date.now();

  try {
    const apiKey = requireEnv('OPENAI_API_KEY');
    const model = Deno.env.get('OPENAI_VISION_MODEL') || 'gpt-4o-mini';

    const ct = req.headers.get('content-type') || '';
    if (!ct.includes('multipart/form-data')) {
      return json({ error: 'Expected multipart/form-data', requestId }, { status: 400 });
    }

    const form = await req.formData();
    const image = form.get('image');
    if (!(image instanceof File)) {
      return json({ error: 'Missing multipart field "image"', requestId }, { status: 400 });
    }

    const dataUrl = await fileToDataUrl(image);

    const out = await completionToTransactions({
      apiKey,
      model,
      userContent: [
        { type: 'text', text: 'Extract all individual transactions from this account activity screenshot.' },
        { type: 'image_url', image_url: { url: dataUrl } },
      ],
    });

    return json({ ...out, requestId, timingsMs: { total: Date.now() - t0 } });
  } catch (e) {
    return json(
      {
        error: (e as any)?.message || 'Server error',
        requestId,
        timingsMs: { total: Date.now() - t0 },
      },
      { status: 500 }
    );
  }
});
