// Trial accounts — the scheduler → trial reminder EMAIL sweep trigger protocol (SA-TRIAL-REMINDER-1). The ONLY caller is the GitHub
// Actions workflow .github/workflows/trial-reminders.yml (scripts/trial-reminder-sweep.mjs signs with Node crypto).
// Modelled on SA-REMINDER-SWEEP-1 (lib/reminder-sweep-protocol.js) with its OWN label, logical path, header names and key, so a
// signature of one protocol can never be presented as another:
//     x-sa-trial-protocol    "1"
//     x-sa-trial-timestamp   Unix seconds (10 digits), accepted within ±300 s of this host's clock
//     x-sa-trial-request-id  /^[A-Za-z0-9_-]{20,64}$/ — a fresh crypto-random id per trigger, part of the HMAC input
//     x-sa-trial-signature   "v1=" + hex(HMAC-SHA256(key, "SA-TRIAL-REMINDER-1\nPOST\n/api/trial-reminder-sweep\n" + timestamp +
//                                                      "\n" + requestId + "\n" + hex(SHA-256(raw body))))
// The key is TRIAL_REMINDER_SWEEP_HMAC_KEY — a FIFTH key: refused when it equals the runner, callback, recovery-sweep or assignment
// reminder key. Replay inside the window is harmless by construction: each email is reserved once by a create-only marker.
const crypto = require("crypto");

const TRIAL_PROTOCOL = "SA-TRIAL-REMINDER-1";
const TRIAL_PATH = "/api/trial-reminder-sweep";
const TRIAL_MAX_SKEW_SECONDS = 300;
const TRIAL_HEADERS = Object.freeze({ protocol: "x-sa-trial-protocol", timestamp: "x-sa-trial-timestamp", requestId: "x-sa-trial-request-id", signature: "x-sa-trial-signature" });
const REQUEST_ID = /^[A-Za-z0-9_-]{20,64}$/;
const TIMESTAMP = /^\d{10}$/;
const SIGNATURE = /^v1=([0-9a-f]{64})$/;
const KEY_MIN_LENGTH = 32, KEY_MAX_LENGTH = 512;
const OTHER_KEYS = Object.freeze(["CODING_RUNNER_HMAC_KEY", "CODING_GRADING_CALLBACK_HMAC_KEY", "CODING_GRADING_SWEEP_HMAC_KEY", "ASSIGNMENT_REMINDER_SWEEP_HMAC_KEY"]);

const toBuffer = body => (Buffer.isBuffer(body) ? body : Buffer.from(String(body || ""), "utf8"));
const canonical = (timestamp, requestId, body) => [TRIAL_PROTOCOL, "POST", TRIAL_PATH, String(timestamp), String(requestId), crypto.createHash("sha256").update(toBuffer(body)).digest("hex")].join("\n");
const mac = (key, text) => crypto.createHmac("sha256", Buffer.from(String(key), "utf8")).update(text, "utf8").digest();
const header = (headers, name) => {
  if (!headers) return undefined;
  const v = typeof headers.get === "function" ? headers.get(name) : headers[name];
  return typeof v === "string" ? v : undefined;
};

/** The configured key, or null when missing, malformed, or equal to one of the four other keys (key separation). */
function resolveTrialReminderKey(env = process.env) {
  const key = env && typeof env === "object" ? env.TRIAL_REMINDER_SWEEP_HMAC_KEY : undefined;
  if (typeof key !== "string" || key.length < KEY_MIN_LENGTH || key.length > KEY_MAX_LENGTH || /\s/.test(key)) return null;
  if (OTHER_KEYS.some(name => typeof env[name] === "string" && env[name].trim() && env[name].trim() === key)) return null;
  return key;
}

function signTrialReminderRequest({ key, timestamp, requestId, body }) {
  return { [TRIAL_HEADERS.protocol]: "1", [TRIAL_HEADERS.timestamp]: String(timestamp), [TRIAL_HEADERS.requestId]: String(requestId), [TRIAL_HEADERS.signature]: "v1=" + mac(key, canonical(timestamp, requestId, body)).toString("hex") };
}

/** Verifies one trigger. → { ok: true, requestId } | { ok: false, reason } (format → HMAC in constant time → timestamp window). */
function verifyTrialReminderRequest({ key, headers, body, nowMs = Date.now() }) {
  if (typeof key !== "string" || !key) return { ok: false, reason: "not-configured" };
  const protocol = header(headers, TRIAL_HEADERS.protocol), timestamp = header(headers, TRIAL_HEADERS.timestamp), requestId = header(headers, TRIAL_HEADERS.requestId), signature = header(headers, TRIAL_HEADERS.signature);
  if (protocol !== "1") return { ok: false, reason: "protocol" };
  if (!timestamp || !TIMESTAMP.test(timestamp)) return { ok: false, reason: "timestamp" };
  if (!requestId || !REQUEST_ID.test(requestId)) return { ok: false, reason: "request-id" };
  const m = signature && SIGNATURE.exec(signature);
  if (!m) return { ok: false, reason: "signature-format" };
  const expected = mac(key, canonical(timestamp, requestId, body)), given = Buffer.from(m[1], "hex");
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return { ok: false, reason: "signature" };
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > TRIAL_MAX_SKEW_SECONDS) return { ok: false, reason: "stale" };
  return { ok: true, requestId };
}

module.exports = { TRIAL_PROTOCOL, TRIAL_PATH, TRIAL_HEADERS, TRIAL_MAX_SKEW_SECONDS, resolveTrialReminderKey, signTrialReminderRequest, verifyTrialReminderRequest };
