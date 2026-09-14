// Roadmap #9 — frontend correlation helper. Extracts the backend correlation id (X-Request-ID) from a failed
// API response so an UNEXPECTED server error can show the user a subtle, quotable tracking code. It never
// changes the UI or the Arabic messages; it only OPTIONALLY appends a trailing "(رمز التتبع: …)" and only for
// genuinely unexpected failures — a 5xx, or a network error where no server response exists. Ordinary,
// expected client responses (400/401/403/404/409/422/429) never get a tracking code, so validation and
// auth prompts stay clean.

type HeaderBag = { get?: (name: string) => string | null } | null | undefined;
type ResponseLike = { status?: number; headers?: HeaderBag } | null | undefined;

const REQUEST_ID_RE = /^[A-Za-z0-9._-]{1,80}$/;

// Read and validate the X-Request-ID header from a response. Returns "" when absent/malformed/unavailable.
export function extractRequestId(response: ResponseLike): string {
  try {
    const headers = response && response.headers;
    const raw = headers && typeof headers.get === "function" ? headers.get("x-request-id") : null;
    const value = String(raw || "").trim();
    return REQUEST_ID_RE.test(value) ? value : "";
  } catch {
    return "";
  }
}

// A status is "unexpected" (worth surfacing a trace) when it is a 5xx, or 0 — the convention for a request
// that never produced a server response (network failure). Every intentional client-facing status is expected.
export function isUnexpectedStatus(status: number | null | undefined): boolean {
  const s = Number(status) || 0;
  return s === 0 || s >= 500;
}

// The subtle Arabic tracking suffix, e.g. " (رمز التتبع: abc123)". Empty when there is no id.
export function trackingSuffix(requestId: string): string {
  const id = String(requestId || "").trim();
  return id ? " (رمز التتبع: " + id + ")" : "";
}

// Compose a user-facing message: keep the given Arabic message and, ONLY for an unexpected status with a known
// request id, append the tracking suffix. Safe to call for every error path — it self-limits.
export function withTrackingCode(message: string, status: number | null | undefined, response?: ResponseLike): string {
  const base = String(message || "");
  if (!isUnexpectedStatus(status)) return base;
  const id = extractRequestId(response ?? null);
  return id ? base + trackingSuffix(id) : base;
}
