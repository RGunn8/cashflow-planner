# Cashflow Planner (Expo Router + InstantDB)

A React Native (Expo Router) cashflow planning app with:
- Calendar/Home cashflow strip (7d/14d) + day detail list
- Accounts with correct **actual balances** (opening + actual posted transactions; excludes what-if)
- Scheduled recurring income/bills/transfers (Planning)
- Goals (target-by-date + recurring) with path editing
- Voice input (cloud transcription) to prefill transactions / recurring items

## Tech
- Expo / React Native (Expo Router)
- InstantDB (data + auth)
- Uniwind (Tailwind-style className)

---

## Quickstart

### 1) Install
```bash
npm install
```

### 2) Configure env
Create a `.env.local` in the repo root:

```bash
EXPO_PUBLIC_INSTANT_APP_ID=YOUR_INSTANT_APP_ID
EXPO_PUBLIC_VOICE_API_URL=https://YOUR-VOICE-SERVICE.onrender.com
```

> Note: `EXPO_PUBLIC_VOICE_API_URL` should be the **base URL only** (no `/voice/parse`).

### 3) Run
```bash
npx expo start -c
```

---

## Parse/Voice backend (Supabase Edge Functions)

AI-assisted parsing runs on Supabase Edge Functions (Deno) under `supabase/functions/`.

### Deployed base URL
Set this in `.env.local`:

```bash
EXPO_PUBLIC_PARSE_API_URL=https://<project-ref>.functions.supabase.co
# (fallback name also supported)
# EXPO_PUBLIC_VOICE_API_URL=https://<project-ref>.functions.supabase.co
```

### Functions
These names/paths are chosen to match the app’s current requests:

- `text` function
  - `POST /text/parse` with JSON `{ text: string }`

- `image` function
  - `POST /image/parse-transactions` with multipart form-data field `image`

- (optional) `voice-parse` function
  - `POST /voice-parse` with multipart form-data field `audio`

### Secrets / env vars (Supabase)
Set via Supabase CLI:

```bash
supabase secrets set OPENAI_API_KEY=... \
  OPENAI_VISION_MODEL=gpt-4o-mini \
  OPENAI_TRANSCRIBE_MODEL=whisper-1 \
  OPENAI_EXTRACT_MODEL=gpt-4o-mini
```

### Deploy
```bash
supabase functions deploy text
supabase functions deploy image
supabase functions deploy voice-parse   # optional
```

> Note: the local `server/` and `voice-backend/` folders are legacy Render/Node implementations.

---

## UI features

### Activity
- **Swipe to delete** on a single transaction.
- **Multi-select mode**:
  - Tap **Select** in the header.
  - Tap rows to select.
  - Bulk actions:
    - **Delete** selected
    - **Add tags** to selected (merged into existing tags)

### Planning
- Swipe-to-delete for:
  - Recurring income
  - Recurring bills
  - Goals

Deleting a recurring rule/goal also deletes its materialized `scheduledEvents` (based on `ruleId`).

---

## Notes
- “Actual balance” = account opening balance + sum of **posted transactions** (non-what-if). Scheduled events are forecast-only.
- For best voice performance, keep recordings short (the app auto-stops after ~12 seconds).
