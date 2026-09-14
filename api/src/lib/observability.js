const crypto = require("crypto");

// Roadmap #9 — Observability. A small, dependency-free structured-logging + request-correlation layer for
// the Azure Functions API. It emits stable, JSON-shaped events (one object per log line) that Azure /
// Application Insights collects from stdout/stderr with NO extra provisioning here. It NEVER changes product
// behavior: logging failures are swallowed, no extra storage I/O happens on the hot path, and it never alters
// a handler's response status or body (it only ADDS an X-Request-ID header and, for an unexpected throw, a
// generic 500 that the handler would otherwise have produced anyway).
//
// PRIVACY IS THE CENTRAL CONSTRAINT: fields are deep-redacted by key name before they are ever serialized, so
// passwords, hashes, salts, tokens, auth headers, secrets, identity numbers, names, emails, request bodies,
// student answers, answer keys and prompts can never reach a log line. See SENSITIVE_KEY_HINTS + redact().

// ── Severity ─────────────────────────────────────────────────────────────────
const LEVELS = { info: "info", warn: "warn", error: "error" };

// ── Redaction ────────────────────────────────────────────────────────────────
// A key is redacted when its normalized form (lowercased, non-alphanumerics stripped) CONTAINS any of these
// hints. Containment (not equality) so `temporaryPassword`, `student_password`, `passwordHash`, `x-student-
// token`, `correctAnswers`, `draftAnswers`, `identityNumber` are all caught. Operational ids that are safe to
// keep (requestId, assignmentId, classId, userId hash) do NOT contain any hint.
const SENSITIVE_KEY_HINTS = [
  "password", "passwd", "hash", "salt",
  "token", "authorization", "auth", "cookie", "secret", "credential", "bearer", "apikey",
  "answer", "draft", "correct", "solution", "markscheme",
  "identity", "idnumber", "nationalid",
  "displayname", "firstname", "familyname", "lastname", "fullname", "studentname", "name",
  "email", "phone",
  "prompt", "questiontext", "question", "content", "body", "payload", "html", "text", "message"
];
// A few operational keys we explicitly WANT to keep even though they contain a hint substring above
// (e.g. "assignmentId" contains no hint; but "errorMessage" contains "message"). Whitelist by normalized key.
const KEEP_KEYS = new Set([
  "event", "level", "route", "method", "status", "durationms", "requestid", "operation",
  "errorcode", "errorname", "errorclass", "attempt", "attempts", "count", "role", "reason",
  "assignmentid", "classid", "userref", "actorref", "outcome", "kind", "service", "app",
  "version", "time", "timestamp", "sampled", "retryable"
]);

const REDACTED = "[redacted]";
const MAX_DEPTH = 4;
const MAX_ARRAY = 20;
const MAX_STRING = 512;

function normalizeKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveKey(key) {
  const norm = normalizeKey(key);
  if (KEEP_KEYS.has(norm)) return false;
  return SENSITIVE_KEY_HINTS.some(hint => norm.includes(hint));
}

// Deep, bounded, key-name-based redaction. Returns a NEW structure safe to serialize. Never throws.
function redact(value, depth = 0) {
  if (value === null || value === undefined) return value;
  const type = typeof value;
  if (type === "string") return value.length > MAX_STRING ? value.slice(0, MAX_STRING) + "…" : value;
  if (type === "number" || type === "boolean") return value;
  if (type === "bigint") return String(value);
  if (type === "function" || type === "symbol") return undefined;
  if (value instanceof Error) return safeError(value);
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (Array.isArray(value)) {
    const out = [];
    for (let i = 0; i < value.length && i < MAX_ARRAY; i++) out.push(redact(value[i], depth + 1));
    if (value.length > MAX_ARRAY) out.push("[+" + (value.length - MAX_ARRAY) + " more]");
    return out;
  }
  if (type === "object") {
    const out = {};
    for (const key of Object.keys(value)) {
      if (isSensitiveKey(key)) { out[key] = REDACTED; continue; }
      out[key] = redact(value[key], depth + 1);
    }
    return out;
  }
  return undefined;
}

// ── Error classification + safe serialization ────────────────────────────────
// A small normalized technical taxonomy — logged for triage, never sent to clients.
function classifyStatus(status) {
  const s = Number(status) || 0;
  if (s >= 500) return "internal_error";
  if (s === 429) return "throttled";
  if (s === 409) return "conflict";
  if (s === 404) return "not_found";
  if (s === 403) return "forbidden";
  if (s === 401) return "unauthorized";
  if (s === 400 || s === 422) return "validation_error";
  return "";
}

function classifyError(error) {
  if (!error) return "internal_error";
  const explicit = String(error.classification || error.errorClass || "");
  if (explicit) return explicit;
  const status = Number(error.httpStatus ?? error.statusCode ?? error.status ?? 0);
  if (status) return classifyStatus(status) || "internal_error";
  const name = String(error.name || "");
  if (name === "StorageConflictError") return "storage_error";
  if (name === "CredentialLockBusyError") return "conflict";
  return "internal_error";
}

// Reduce any thrown value to a small set of SAFE properties. Never includes a stack trace, request body,
// or arbitrary nested payload. The message is kept (our domain errors are safe Arabic/technical strings) but
// length-capped; if a message somehow embedded a marker it is still key-safe because it is a plain string
// under the "message"/"errorMessage" key which callers never place secrets into.
function safeError(error) {
  if (!error) return { errorName: "UnknownError", errorClass: "internal_error" };
  if (typeof error === "string") return { errorName: "Error", errorMessage: error.slice(0, MAX_STRING), errorClass: "internal_error" };
  const out = {
    errorName: String(error.name || "Error").slice(0, 120),
    errorClass: classifyError(error)
  };
  const code = error.code || error.errorCode;
  if (code) out.errorCode = String(code).slice(0, 120);
  const status = Number(error.httpStatus ?? error.statusCode ?? error.status ?? 0);
  if (status) out.errorStatus = status;
  if (error.message) out.errorMessage = String(error.message).slice(0, MAX_STRING);
  return out;
}

// A pseudonymous, non-reversible tag for a subject id (never the raw id). Short so logs stay small.
function pseudonym(value) {
  if (value === null || value === undefined || value === "") return "";
  return "u_" + crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
}

// ── Request-id sanitization ──────────────────────────────────────────────────
// Accept a caller-supplied id ONLY when it is short and free of control/injection characters; otherwise mint
// a fresh UUID. This prevents log-forging via a crafted x-request-id.
const REQUEST_ID_RE = /^[A-Za-z0-9._-]{1,80}$/;
function sanitizeRequestId(value) {
  const s = String(value == null ? "" : value).trim();
  if (REQUEST_ID_RE.test(s)) return s;
  return crypto.randomUUID();
}
function readHeaderSafe(request, name) {
  try { return request && request.headers && typeof request.headers.get === "function" ? request.headers.get(name) : null; }
  catch { return null; }
}
function methodOf(request) {
  try { return String((request && request.method) || "").toUpperCase() || "UNKNOWN"; } catch { return "UNKNOWN"; }
}

// ── Sink (where events go) ───────────────────────────────────────────────────
// Default: one JSON object per line to the appropriate console stream. Azure captures these. A test can swap
// the sink to capture events. The sink is always invoked inside try/catch so a logging failure is inert.
function defaultSink(record) {
  const line = safeStringify(record);
  if (record.level === LEVELS.error) console.error(line);
  else if (record.level === LEVELS.warn) console.warn(line);
  else console.log(line);
}
function safeStringify(record) {
  try { return JSON.stringify(record); }
  catch { try { return JSON.stringify({ level: record && record.level, event: record && record.event, note: "unserializable-fields-dropped" }); } catch { return '{"event":"log.serialize.failed"}'; } }
}
let currentSink = defaultSink;
function setSink(fn) { currentSink = typeof fn === "function" ? fn : defaultSink; }
function resetSink() { currentSink = defaultSink; }

function emit(ctx, level, event, fields) {
  try {
    const record = {
      timestamp: new Date().toISOString(),
      level,
      event: String(event || "log.event"),
      requestId: ctx ? ctx.requestId : undefined,
      route: ctx ? ctx.route : undefined,
      method: ctx ? ctx.method : undefined
    };
    const safe = fields ? redact(fields) : null;
    if (safe && typeof safe === "object") Object.assign(record, safe);
    try { currentSink(record); } catch { /* logging must never break the caller */ }
    return record;
  } catch {
    return null; // observability itself must never throw into a handler
  }
}

// ── Request context ──────────────────────────────────────────────────────────
// createRequestContext(request, { route }) → a small handle carrying the requestId + timing, with log
// helpers. `startedAt` uses a monotonic clock so durationMs is unaffected by wall-clock changes.
function nowMonotonic() {
  try { return Number(process.hrtime.bigint() / 1000n) / 1000; } catch { return Date.now(); }
}

function createRequestContext(request, options = {}) {
  const incoming = readHeaderSafe(request, "x-request-id");
  const requestId = sanitizeRequestId(incoming);
  const ctx = {
    requestId,
    route: String(options.route || "unknown"),
    method: methodOf(request),
    startedAt: nowMonotonic(),
    _finished: false
  };
  ctx.logInfo = (event, fields) => emit(ctx, LEVELS.info, event, fields);
  ctx.logWarn = (event, fields) => emit(ctx, LEVELS.warn, event, fields);
  ctx.logError = (event, error, fields) => emit(ctx, LEVELS.error, event, { ...(fields || {}), error: safeError(error) });
  ctx.durationMs = () => Math.max(0, Math.round((nowMonotonic() - ctx.startedAt) * 1000) / 1000);
  ctx.headers = () => ({ "X-Request-ID": ctx.requestId });
  ctx.finish = (status, fields) => finishRequest(ctx, status, fields);
  return ctx;
}

// Emit the terminal event for a request. status>=500 → http.request.failed; otherwise http.request.completed.
// Idempotent (only the first call emits) so both a handler and the wrapper can call it safely.
function finishRequest(ctx, status, fields = {}) {
  if (!ctx || ctx._finished) return null;
  ctx._finished = true;
  const s = Number(status) || 0;
  const errorCode = classifyStatus(s);
  const base = { status: s, durationMs: ctx.durationMs() };
  if (errorCode) base.errorCode = errorCode;
  const event = s >= 500 ? "http.request.failed" : "http.request.completed";
  const level = s >= 500 ? LEVELS.error : LEVELS.info;
  return emit(ctx, level, event, { ...base, ...fields });
}

// Build an observer for platform-storage's mutateJsonWithRetry (its optional 4th arg). Emits safe storage
// events bound to this request context — only attempt counters, never blob names or document contents. When
// ctx is absent (a bare-handler unit test) it returns a no-op observer so wiring is always safe.
function storageObserver(ctx, fields = {}) {
  if (!ctx) return { onConflict() {}, onRetry() {}, onExhausted() {} };
  return {
    onConflict(info) { ctx.logWarn("storage.conflict", { ...fields, attempt: info && info.attempt, retryable: true }); },
    onRetry(info) { ctx.logWarn("storage.retry", { ...fields, attempt: info && info.attempt }); },
    onExhausted(info) { ctx.logError("storage.retry.exhausted", new Error("optimistic concurrency retry exhausted"), { ...fields, attempts: info && info.attempts }); }
  };
}

// Merge X-Request-ID into a handler response's headers WITHOUT overwriting anything the handler set.
function withRequestIdHeader(response, ctx) {
  const res = response && typeof response === "object" ? response : { status: 200 };
  const headers = { ...(res.headers || {}) };
  if (!("X-Request-ID" in headers) && !("x-request-id" in headers)) headers["X-Request-ID"] = ctx.requestId;
  return { ...res, headers };
}

// ── Endpoint wrapper ─────────────────────────────────────────────────────────
// withObservability(route, innerHandler) → the function to register with app.http. It:
//   1. builds a request context (requestId from a safe x-request-id, else a UUID),
//   2. invokes the inner handler unchanged, passing the context as a THIRD argument so a handler MAY emit
//      domain events (existing handlers ignore it; tests call the bare handler without it),
//   3. adds X-Request-ID to the response headers (never overwriting),
//   4. emits the terminal http.request.* event with status + durationMs,
//   5. on an UNEXPECTED throw, logs the safe error and returns a generic 500 (with X-Request-ID) — it never
//      converts an intentional 4xx into a 500, because handlers already return those as values.
// Logging never changes the status/body the handler chose.
function withObservability(route, innerHandler, options = {}) {
  return async function observedHandler(request, azureCtxOrDeps) {
    const ctx = createRequestContext(request, { route });
    try {
      const response = await innerHandler(request, azureCtxOrDeps, ctx);
      const withHeader = withRequestIdHeader(response, ctx);
      finishRequest(ctx, withHeader.status, options.completedFields ? options.completedFields(withHeader) : undefined);
      return withHeader;
    } catch (error) {
      ctx.logError("http.request.exception", error, { route });
      const body = { ok: false, error: (options.errorMessage || "تعذر تنفيذ الطلب حاليًا.") };
      if (options.includeRequestIdInBody !== false) body.requestId = ctx.requestId;
      const response = { status: 500, headers: { "Cache-Control": "no-store", "X-Request-ID": ctx.requestId }, jsonBody: body };
      finishRequest(ctx, 500);
      return response;
    }
  };
}

module.exports = {
  LEVELS,
  redact,
  safeError,
  classifyStatus,
  classifyError,
  pseudonym,
  sanitizeRequestId,
  createRequestContext,
  finishRequest,
  withRequestIdHeader,
  withObservability,
  storageObserver,
  setSink,
  resetSink,
  // exported for focused unit tests
  isSensitiveKey,
  SENSITIVE_KEY_HINTS
};
