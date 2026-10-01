// Phase 17C — the SmartAssess side of the Runner → SmartAssess OFFICIAL GRADING CALLBACK protocol (SA-CODING-CALLBACK-1).
// An independent implementation of the gateway's callback signer (the application never imports runner code); a parity test pins
// both to the same bytes.
//     x-sa-callback-protocol    "1"
//     x-sa-callback-timestamp   Unix seconds (10 digits), accepted within ±300 s of this host's clock
//     x-sa-callback-request-id  /^[A-Za-z0-9_-]{1,64}$/ (fresh per delivery attempt)
//     x-sa-callback-signature   "v1=" + hex(HMAC-SHA256(key, "SA-CODING-CALLBACK-1\nPOST\n/api/coding/grade-callback\n" +
//                                                         timestamp + "\n" + requestId + "\n" + hex(SHA-256(raw body))))
// The key is CODING_GRADING_CALLBACK_HMAC_KEY — a key that exists ONLY for callbacks. It is NOT the API → runner request-signing
// key and not a session secret, so a party holding the runner request key cannot forge a grading result, and vice versa. The
// signature always covers the FIXED logical path (never the URL the request arrived on) and the exact raw body bytes; the digest
// comparison is constant-time (crypto.timingSafeEqual). Replays inside the window are harmless by construction: applying a
// callback is idempotent and bound to (job id, revision, grading key) — see official-grading.js.
const crypto = require("crypto");

const CALLBACK_PROTOCOL = "SA-CODING-CALLBACK-1";
const CALLBACK_PATH = "/api/coding/grade-callback";
const CALLBACK_MAX_SKEW_SECONDS = 300;
const HEADERS = Object.freeze({ protocol: "x-sa-callback-protocol", timestamp: "x-sa-callback-timestamp", requestId: "x-sa-callback-request-id", signature: "x-sa-callback-signature" });
const REQUEST_ID = /^[A-Za-z0-9_-]{1,64}$/;
const TIMESTAMP = /^\d{10}$/;
const SIGNATURE = /^v1=([0-9a-f]{64})$/;

/** The callback verification key from the Function App settings, or null (fail closed: missing / weak / whitespace). */
function readCallbackKey(env = process.env) {
  const key = env && typeof env === "object" ? env.CODING_GRADING_CALLBACK_HMAC_KEY : undefined;
  if (typeof key !== "string" || key.length < 32 || key.length > 512 || /\s/.test(key)) return null;
  return key;
}

const sha256Hex = body => crypto.createHash("sha256").update(body).digest("hex");
const canonical = (timestamp, requestId, body) => [CALLBACK_PROTOCOL, "POST", CALLBACK_PATH, timestamp, requestId, sha256Hex(body)].join("\n");
const mac = (key, text) => crypto.createHmac("sha256", Buffer.from(String(key), "utf8")).update(text, "utf8").digest();
const header = (headers, name) => {
  if (!headers) return undefined;
  const v = typeof headers.get === "function" ? headers.get(name) : headers[name];
  return typeof v === "string" ? v : undefined;
};

/** Verifies one callback. Returns { ok: true, requestId } or { ok: false, reason } (the reason is for safe telemetry only). */
function verifyCallbackRequest({ key, headers, body, nowMs = Date.now() }) {
  if (typeof key !== "string" || !key) return { ok: false, reason: "not-configured" };
  const protocol = header(headers, HEADERS.protocol), timestamp = header(headers, HEADERS.timestamp), requestId = header(headers, HEADERS.requestId), signature = header(headers, HEADERS.signature);
  if (protocol !== "1") return { ok: false, reason: "protocol" };
  if (!timestamp || !TIMESTAMP.test(timestamp)) return { ok: false, reason: "timestamp" };
  if (!requestId || !REQUEST_ID.test(requestId)) return { ok: false, reason: "request-id" };
  const m = signature && SIGNATURE.exec(signature);
  if (!m) return { ok: false, reason: "signature-format" };
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > CALLBACK_MAX_SKEW_SECONDS) return { ok: false, reason: "stale" };
  const expected = mac(key, canonical(timestamp, requestId, Buffer.isBuffer(body) ? body : Buffer.from(String(body || ""), "utf8")));
  const given = Buffer.from(m[1], "hex");
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return { ok: false, reason: "signature" };
  return { ok: true, requestId };
}

/** The headers the runner sends (used by parity tests; the API itself never sends callbacks). */
function signCallbackRequest({ key, timestamp, requestId, body }) {
  const sig = mac(key, canonical(String(timestamp), String(requestId), Buffer.isBuffer(body) ? body : Buffer.from(String(body || ""), "utf8"))).toString("hex");
  return { [HEADERS.protocol]: "1", [HEADERS.timestamp]: String(timestamp), [HEADERS.requestId]: String(requestId), [HEADERS.signature]: "v1=" + sig };
}

module.exports = { CALLBACK_PROTOCOL, CALLBACK_PATH, CALLBACK_MAX_SKEW_SECONDS, CALLBACK_HEADERS: HEADERS, readCallbackKey, verifyCallbackRequest, signCallbackRequest };
