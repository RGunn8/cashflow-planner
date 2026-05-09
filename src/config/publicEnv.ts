/** Deployed Node backend: POST /text/parse, POST /image/parse-transactions. Trailing slash optional. */
export function cashflowBackendBaseUrl(): string | null {
  const raw = process.env.EXPO_PUBLIC_PARSE_API_URL || process.env.EXPO_PUBLIC_VOICE_API_URL;
  if (!raw?.trim()) return null;
  return raw.replace(/\/$/, '');
}
