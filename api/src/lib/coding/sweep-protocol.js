// Phase 17D-A — the scheduler → SmartAssess RECOVERY SWEEP trigger protocol (SA-CODING-SWEEP-1). The ONLY caller is the GitHub
// Actions workflow .github/workflows/coding-grading-recovery.yml (scripts/coding-grading-sweep.mjs signs with Node crypto).
//     x-sa-sweep-protocol    "1"
//     x-sa-sweep-timestamp   Unix seconds (10 digits), accepted within ±300 s of this host's clock
//     x-sa-sweep-request-id  /^[A-Za-z0-9_-]{20,64}$/ — a fresh crypto-random id per trigger, part of the HMAC input; Phase 17D-B1
//                            reserves it once in a durable replay ledger (sweep-replay-ledger.js); also the sweep lease owner id
//     x-sa-sweep-signature   "v1=" + hex(HMAC-SHA256(key, "SA-CODING-SWEEP-1\nPOST\n/api/coding/grading-sweep\n" + timestamp +
//                                                      "\n" + requestId + "\n" + hex(SHA-256(raw body))))
// The key is CODING_GRADING_SWEEP_HMAC_KEY — a THIRD key, never the runner request key nor the callback key (enforced on the raw
// secrets by resolveSweepKey). The protocol label, the fixed logical path and the header names all differ from
// SA-CODING-RUNNER-1 / SA-CODING-CALLBACK-1, so a signature of one protocol can never be presented as another.
// Verification order: format → HMAC (constant time) → timestamp window. Replay inside the window is harmless by construction:
// a sweep is idempotent (it re-dispatches the same revision of targets that are still due), bounded, and serialized by the
// sweep lease — and since Phase 17D-B1 an exact replay is refused outright (409 REPLAYED_REQUEST): the authenticated request id
// is reserved once in a durable ledger after this verification and before the sweep runs. The canonical bytes are unchanged
// (the request id was always signed), so the protocol stays SA-CODING-SWEEP-1; 17D-B1 only tightens the id format (≥ 20).
const crypto = require("crypto");

const SWEEP_PROTOCOL = "SA-CODING-SWEEP-1";
const SWEEP_PATH = "/api/coding/grading-sweep";
const SWEEP_MAX_SKEW_SECONDS = 300;
const SWEEP_HEADERS = Object.freeze({ protocol: "x-sa-sweep-protocol", timestamp: "x-sa-sweep-timestamp", requestId: "x-sa-sweep-request-id", signature: "x-sa-sweep-signature" });
const REQUEST_ID = /^[A-Za-z0-9_-]{20,64}$/;
const TIMESTAMP = /^\d{10}$/;
const SIGNATURE = /^v1=([0-9a-f]{64})$/;

const toBuffer = body => (Buffer.isBuffer(body) ? body : Buffer.from(String(body || ""), "utf8"));
const canonical = (timestamp, requestId, body) => [SWEEP_PROTOCOL, "POST", SWEEP_PATH, String(timestamp), String(requestId), crypto.createHash("sha256").update(toBuffer(body)).digest("hex")].join("\n");
const mac = (key, text) => crypto.createHmac("sha256", Buffer.from(String(key), "utf8")).update(text, "utf8").digest();
const header = (headers, name) => {
  if (!headers) return undefined;
  const v = typeof headers.get === "function" ? headers.get(name) : headers[name];
  return typeof v === "string" ? v : undefined;
};

/** The headers of one signed sweep trigger (the scheduler script is an independent implementation; tests pin both). */
function signSweepRequest({ key, timestamp, requestId, body }) {
  return { [SWEEP_HEADERS.protocol]: "1", [SWEEP_HEADERS.timestamp]: String(timestamp), [SWEEP_HEADERS.requestId]: String(requestId), [SWEEP_HEADERS.signature]: "v1=" + mac(key, canonical(timestamp, requestId, body)).toString("hex") };
}

/** Verifies one trigger. → { ok: true, requestId } | { ok: false, reason } (the reason is for safe telemetry only). */
function verifySweepRequest({ key, headers, body, nowMs = Date.now() }) {
  if (typeof key !== "string" || !key) return { ok: false, reason: "not-configured" };
  const protocol = header(headers, SWEEP_HEADERS.protocol), timestamp = header(headers, SWEEP_HEADERS.timestamp), requestId = header(headers, SWEEP_HEADERS.requestId), signature = header(headers, SWEEP_HEADERS.signature);
  if (protocol !== "1") return { ok: false, reason: "protocol" };
  if (!timestamp || !TIMESTAMP.test(timestamp)) return { ok: false, reason: "timestamp" };
  if (!requestId || !REQUEST_ID.test(requestId)) return { ok: false, reason: "request-id" };
  const m = signature && SIGNATURE.exec(signature);
  if (!m) return { ok: false, reason: "signature-format" };
  const expected = mac(key, canonical(timestamp, requestId, body)), given = Buffer.from(m[1], "hex");
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return { ok: false, reason: "signature" };
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > SWEEP_MAX_SKEW_SECONDS) return { ok: false, reason: "stale" };
  return { ok: true, requestId };
}

module.exports = { SWEEP_PROTOCOL, SWEEP_PATH, SWEEP_MAX_SKEW_SECONDS, SWEEP_HEADERS, SWEEP_REQUEST_ID: REQUEST_ID, signSweepRequest, verifySweepRequest };
