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

## Voice backend (Render)

The voice endpoint is a small Node service located at `voice-backend/`.

### Endpoints
- `GET /health` → `{ ok: true }`
- `POST /voice/parse` → multipart/form-data with an `audio` field

### Required Render env vars
Set these in your Render service environment:
- `OPENAI_API_KEY` (secret)
- `OPENAI_TRANSCRIBE_MODEL` (default `whisper-1`)
- `OPENAI_EXTRACT_MODEL` (default `gpt-4o-mini`)

### Debugging voice latency / errors
The backend logs request-scoped timing information to Render logs.
Look for lines like:
- `[voice:<requestId>] transcription:start`
- `[voice:<requestId>] extract:start`
- `[voice:<requestId>] success { totalMs: ... }`

If you see `ECONNRESET` / `APIConnectionError`, it indicates transient network resets when calling OpenAI.

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
