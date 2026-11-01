const crypto = require("crypto");

// Tadris+ P1-A — TOTP (RFC 6238, HMAC-SHA1, 6 digits, 30-second steps) for the platform owner (owner decision D4).
// Implemented on node:crypto only — no dependency. Compatible with the common authenticator apps (Google / Microsoft
// Authenticator, 1Password, Aegis …), which use exactly these defaults.
//
// Replay protection: a verified code returns its time STEP; the caller persists it as `lastUsedStep` (compare-and-set) and
// a later verification only accepts a step strictly greater than it, so one code can never be used twice.

const STEP_SECONDS = 30;
const DIGITS = 6;
const WINDOW_STEPS = 1;           // accept the previous / next step too (clock drift)
const SECRET_BYTES = 20;          // 160-bit secret, the RFC 4226 recommendation
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer) {
  let bits = 0, value = 0, out = "";
  for (const byte of buffer) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += BASE32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(text) {
  const clean = String(text || "").toUpperCase().replace(/[\s=-]/g, "");
  if (!clean || /[^A-Z2-7]/.test(clean)) return null;
  let bits = 0, value = 0; const out = [];
  for (const ch of clean) {
    value = (value << 5) | BASE32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

function generateTotpSecret() { return crypto.randomBytes(SECRET_BYTES); }

function stepAt(nowMs) { return Math.floor(Number(nowMs) / 1000 / STEP_SECONDS); }

// HOTP(secret, counter) truncated to `digits` (RFC 4226 §5.3).
function hotp(secret, counter, digits = DIGITS) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac("sha1", secret).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const binary = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, "0");
}

function totpAt(secret, nowMs, digits = DIGITS) { return hotp(secret, stepAt(nowMs), digits); }

function timingSafeEqualText(a, b) {
  const left = Buffer.from(String(a)), right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/**
 * → { ok: true, step } or { ok: false }. `lastUsedStep` (integer or null) blocks replay: only a step strictly greater is
 * accepted. Every window step is computed (no early exit), so timing does not reveal which step matched.
 */
function verifyTotp(secret, code, { nowMs = Date.now(), lastUsedStep = null } = {}) {
  const text = String(code ?? "").replace(/\s/g, "");
  if (!Buffer.isBuffer(secret) || secret.length < 10 || !/^\d{6}$/.test(text)) return { ok: false };
  const current = stepAt(nowMs);
  const floor = Number.isInteger(lastUsedStep) ? lastUsedStep : -Infinity;
  let matched = null;
  for (let delta = -WINDOW_STEPS; delta <= WINDOW_STEPS; delta++) {
    const step = current + delta;
    const equal = timingSafeEqualText(hotp(secret, step), text);
    if (equal && step > floor && matched === null) matched = step;
  }
  return matched === null ? { ok: false } : { ok: true, step: matched };
}

/** otpauth:// URI the authenticator app scans (Key URI Format). Labels are percent-encoded. */
function otpauthUri({ issuer, account, secret }) {
  const iss = String(issuer || "Tadris+");
  const label = encodeURIComponent(iss) + ":" + encodeURIComponent(String(account || "owner"));
  const params = new URLSearchParams({ secret: base32Encode(secret), issuer: iss, algorithm: "SHA1", digits: String(DIGITS), period: String(STEP_SECONDS) });
  return "otpauth://totp/" + label + "?" + params.toString();
}

module.exports = { STEP_SECONDS, DIGITS, WINDOW_STEPS, base32Encode, base32Decode, generateTotpSecret, stepAt, hotp, totpAt, verifyTotp, otpauthUri };
