// D4 (item 8) — the scheduler → automatic assignment REMINDER sweep trigger protocol (SA-REMINDER-SWEEP-1). The ONLY caller is the
// GitHub Actions workflow .github/workflows/assignment-reminders.yml (scripts/assignment-reminder-sweep.mjs signs with Node crypto).
// Modelled on SA-CODING-SWEEP-1 (lib/coding/sweep-protocol.js) with its OWN label, logical path, header names and key, so a signature
// of one protocol can never be presented as the other:
//     x-sa-reminder-protocol    "1"
//     x-sa-reminder-timestamp   Unix seconds (10 digits), accepted within ±300 s of this host's clock
//     x-sa-reminder-request-id  /^[A-Za-z0-9_-]{20,64}$/ — a fresh crypto-random id per trigger, part of the HMAC input
//     x-sa-reminder-signature   "v1=" + hex(HMAC-SHA256(key, "SA-REMINDER-SWEEP-1\nPOST\n/api/assignment-reminder-sweep\n" + timestamp +
//                                                         "\n" + requestId + "\n" + hex(SHA-256(raw body))))
// The key is ASSIGNMENT_REMINDER_SWEEP_HMAC_KEY — a FOURTH key: refused when it equals the runner, callback or recovery-sweep key.
// Replay inside the window is harmless by construction: each reminder is reserved once by a create-only marker, so a replayed sweep
// sends nothing new.
const crypto = require("crypto");

const REMINDER_PROTOCOL = "SA-REMINDER-SWEEP-1";
const REMINDER_PATH = "/api/assignment-reminder-sweep";
const REMINDER_MAX_SKEW_SECONDS = 300;
const REMINDER_HEADERS = Object.freeze({ protocol: "x-sa-reminder-protocol", timestamp: "x-sa-reminder-timestamp", requestId: "x-sa-reminder-request-id", signature: "x-sa-reminder-signature" });
const REQUEST_ID = /^[A-Za-z0-9_-]{20,64}$/;
const TIMESTAMP = /^\d{10}$/;
const SIGNATURE = /^v1=([0-9a-f]{64})$/;
const KEY_MIN_LENGTH = 32, KEY_MAX_LENGTH = 512;
const OTHER_KEYS = Object.freeze(["CODING_RUNNER_HMAC_KEY", "CODING_GRADING_CALLBACK_HMAC_KEY", "CODING_GRADING_SWEEP_HMAC_KEY"]);

const toBuffer = body => (Buffer.isBuffer(body) ? body : Buffer.from(String(body || ""), "utf8"));
const canonical = (timestamp, requestId, body) => [REMINDER_PROTOCOL, "POST", REMINDER_PATH, String(timestamp), String(requestId), crypto.createHash("sha256").update(toBuffer(body)).digest("hex")].join("\n");
const mac = (key, text) => crypto.createHmac("sha256", Buffer.from(String(key), "utf8")).update(text, "utf8").digest();
const header = (headers, name) => {
  if (!headers) return undefined;
  const v = typeof headers.get === "function" ? headers.get(name) : headers[name];
  return typeof v === "string" ? v : undefined;
};

/** The configured key, or null when missing, malformed, or equal to one of the three coding keys (key separation). */
function resolveReminderKey(env = process.env) {
  const key = env && typeof env === "object" ? env.ASSIGNMENT_REMINDER_SWEEP_HMAC_KEY : undefined;
  if (typeof key !== "string" || key.length < KEY_MIN_LENGTH || key.length > KEY_MAX_LENGTH || /\s/.test(key)) return null;
  if (OTHER_KEYS.some(name => typeof env[name] === "string" && env[name].trim() && env[name].trim() === key)) return null;
  return key;
}

function signReminderRequest({ key, timestamp, requestId, body }) {
  return { [REMINDER_HEADERS.protocol]: "1", [REMINDER_HEADERS.timestamp]: String(timestamp), [REMINDER_HEADERS.requestId]: String(requestId), [REMINDER_HEADERS.signature]: "v1=" + mac(key, canonical(timestamp, requestId, body)).toString("hex") };
}

/** Verifies one trigger. → { ok: true, requestId } | { ok: false, reason } (format → HMAC in constant time → timestamp window). */
function verifyReminderRequest({ key, headers, body, nowMs = Date.now() }) {
  if (typeof key !== "string" || !key) return { ok: false, reason: "not-configured" };
  const protocol = header(headers, REMINDER_HEADERS.protocol), timestamp = header(headers, REMINDER_HEADERS.timestamp), requestId = header(headers, REMINDER_HEADERS.requestId), signature = header(headers, REMINDER_HEADERS.signature);
  if (protocol !== "1") return { ok: false, reason: "protocol" };
  if (!timestamp || !TIMESTAMP.test(timestamp)) return { ok: false, reason: "timestamp" };
  if (!requestId || !REQUEST_ID.test(requestId)) return { ok: false, reason: "request-id" };
  const m = signature && SIGNATURE.exec(signature);
  if (!m) return { ok: false, reason: "signature-format" };
  const expected = mac(key, canonical(timestamp, requestId, body)), given = Buffer.from(m[1], "hex");
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return { ok: false, reason: "signature" };
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > REMINDER_MAX_SKEW_SECONDS) return { ok: false, reason: "stale" };
  return { ok: true, requestId };
}

module.exports = { REMINDER_PROTOCOL, REMINDER_PATH, REMINDER_HEADERS, REMINDER_MAX_SKEW_SECONDS, resolveReminderKey, signReminderRequest, verifyReminderRequest };
