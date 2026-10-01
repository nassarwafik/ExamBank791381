"use strict";
// Phase 17B — request authentication between the SmartAssess API and the Coding Runner Gateway.
//
// Every request carries four headers and is signed with HMAC-SHA256 under a key that exists ONLY for this purpose (the gateway's
// RUNNER_HMAC_KEY, configured with the same value on the SmartAssess API side; never a session secret, never a storage credential):
//     x-sa-runner-protocol    "1"
//     x-sa-runner-timestamp   Unix seconds (10 digits)
//     x-sa-runner-request-id  /^[A-Za-z0-9_-]{1,64}$/
//     x-sa-runner-signature   "v1=" + hex(HMAC-SHA256(key, canonical))
//     canonical = "SA-CODING-RUNNER-1\n" + METHOD + "\n" + logical path + "\n" + timestamp + "\n" + requestId + "\n" + hex(SHA-256(body))
// The gateway refuses a missing / malformed / wrong-key / altered (body, method, path, id) / stale (> ±60 s) / replayed request.
// The digest comparison is constant-time. The SmartAssess API has its own independent signer (the runner never imports
// application code); a parity test proves both produce the same signature.
const crypto = require("node:crypto");

const PROTOCOL = "SA-CODING-RUNNER-1";
const PROTOCOL_VERSION = "1";
const MAX_SKEW_SECONDS = 60;
const HEADERS = Object.freeze({ protocol: "x-sa-runner-protocol", timestamp: "x-sa-runner-timestamp", requestId: "x-sa-runner-request-id", signature: "x-sa-runner-signature" });
const REQUEST_ID = /^[A-Za-z0-9_-]{1,64}$/;
const TIMESTAMP = /^\d{10}$/;
const SIGNATURE = /^v1=([0-9a-f]{64})$/;

const sha256Hex = body => crypto.createHash("sha256").update(body || Buffer.alloc(0)).digest("hex");
const canonicalString = ({ method, path, timestamp, requestId, bodySha256 }) => [PROTOCOL, String(method).toUpperCase(), path, timestamp, requestId, bodySha256].join("\n");
const digest = (key, canonical) => crypto.createHmac("sha256", Buffer.from(String(key), "utf8")).update(canonical, "utf8").digest();

/** The four request headers for (method, logical path, timestamp, request id, raw body bytes). */
function signRequest({ key, method, path, timestamp, requestId, body }) {
  const mac = digest(key, canonicalString({ method, path, timestamp, requestId, bodySha256: sha256Hex(body) }));
  return { [HEADERS.protocol]: PROTOCOL_VERSION, [HEADERS.timestamp]: String(timestamp), [HEADERS.requestId]: String(requestId), [HEADERS.signature]: "v1=" + mac.toString("hex") };
}

/** Remembers request ids for the skew window so a captured request cannot be replayed; bounded in time and size. */
function createReplayGuard({ ttlMs = 2 * MAX_SKEW_SECONDS * 1000, max = 10000 } = {}) {
  const seenAt = new Map();
  const prune = nowMs => {
    for (const [id, at] of seenAt) { if (nowMs - at > ttlMs) seenAt.delete(id); else break; }
    while (seenAt.size > max) seenAt.delete(seenAt.keys().next().value);
  };
  return {
    /** true when this id was already seen inside the window (a replay); otherwise records it and returns false. */
    seen(id, nowMs = Date.now()) {
      prune(nowMs);
      if (seenAt.has(id) && nowMs - seenAt.get(id) <= ttlMs) return true;
      seenAt.delete(id);
      seenAt.set(id, nowMs);
      prune(nowMs);
      return false;
    },
    size: () => seenAt.size
  };
}

const header = (headers, name) => {
  if (!headers) return undefined;
  const v = typeof headers.get === "function" ? headers.get(name) : headers[name];
  return Array.isArray(v) ? undefined : (typeof v === "string" ? v : undefined);
};

/** Verifies one request. Returns { ok: true, requestId } or { ok: false, reason } (the reason is for safe telemetry only). */
function verifyRequest({ key, method, path, headers, body, nowMs = Date.now(), replay }) {
  const protocol = header(headers, HEADERS.protocol), timestamp = header(headers, HEADERS.timestamp), requestId = header(headers, HEADERS.requestId), signature = header(headers, HEADERS.signature);
  if (protocol !== PROTOCOL_VERSION) return { ok: false, reason: "protocol" };
  if (!timestamp || !TIMESTAMP.test(timestamp)) return { ok: false, reason: "timestamp" };
  if (!requestId || !REQUEST_ID.test(requestId)) return { ok: false, reason: "request-id" };
  const m = signature && SIGNATURE.exec(signature);
  if (!m) return { ok: false, reason: "signature-format" };
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > MAX_SKEW_SECONDS) return { ok: false, reason: "stale" };
  const mac = digest(key, canonicalString({ method, path, timestamp, requestId, bodySha256: sha256Hex(body) }));
  const given = Buffer.from(m[1], "hex");
  if (given.length !== mac.length || !crypto.timingSafeEqual(given, mac)) return { ok: false, reason: "signature" };
  if (!replay || replay.seen(requestId, nowMs)) return { ok: false, reason: "replay" };
  return { ok: true, requestId };
}

module.exports = { PROTOCOL, PROTOCOL_VERSION, MAX_SKEW_SECONDS, HEADERS, canonicalString, signRequest, verifyRequest, createReplayGuard };
