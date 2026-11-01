const crypto = require("crypto");

// Tadris+ P1-A — password hashing for managed accounts (owner now, teachers in P2-A). Owner decision D2:
// scrypt (built into Node, no native dependency) with STRONG parameters that are STORED WITH EVERY HASH, so the cost can
// be raised later (or the record re-hashed to Argon2id once the runtime provides crypto.argon2) without breaking an
// existing credential. Student passwords keep their own, unchanged helpers in student-auth.js.
//
// Record shape: { algo: "scrypt", N, r, p, keyLen, salt: <base64>, hash: <base64> }
//
// Verification only accepts parameters inside a fixed window. A record outside it (tampered, truncated, absurd cost that
// would exhaust memory) verifies as FALSE — fail closed, never an exception that a caller could mistake for success.

const ALGO = "scrypt";
// N = 2^17, r = 8, p = 1 ≈ 128 MiB and ~0.4 s per hash on a typical vCPU (measured on the P1-A branch: 419 ms).
const DEFAULT_PARAMS = Object.freeze({ N: 131072, r: 8, p: 1, keyLen: 64 });
const MIN_LOG2_N = 14;            // tests hash with 2^14; anything weaker is refused outright
const MAX_LOG2_N = 20;
const SALT_BYTES = 16;
const MAX_SECRET_LENGTH = 1024;   // bounds the work done for an attacker-supplied password

function isPowerOfTwo(n) { return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0; }

// → normalized params or null when outside the accepted window.
function acceptedParams(source) {
  const N = Number(source?.N), r = Number(source?.r), p = Number(source?.p), keyLen = Number(source?.keyLen);
  if (!isPowerOfTwo(N)) return null;
  const log2 = Math.log2(N);
  if (log2 < MIN_LOG2_N || log2 > MAX_LOG2_N) return null;
  if (r !== 8) return null;
  if (!Number.isInteger(p) || p < 1 || p > 4) return null;
  if (!Number.isInteger(keyLen) || keyLen < 32 || keyLen > 64) return null;
  return { N, r, p, keyLen };
}

// Node refuses scrypt above `maxmem` (default 32 MiB); the requirement is ~128 * N * r bytes.
function maxmemFor(params) { return 128 * params.N * params.r * params.p + 32 * 1024 * 1024; }

function scryptAsync(secret, salt, params) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(secret, salt, params.keyLen, { N: params.N, r: params.r, p: params.p, maxmem: maxmemFor(params) }, (err, key) => err ? reject(err) : resolve(key));
  });
}

/** Hash a secret. `options.params` exists for tests only; production always uses DEFAULT_PARAMS. */
async function hashSecret(secret, options = {}) {
  const text = String(secret ?? "");
  if (!text) throw new Error("Cannot hash an empty secret.");
  if (text.length > MAX_SECRET_LENGTH) throw new Error("Secret is too long.");
  const params = acceptedParams(options.params || DEFAULT_PARAMS);
  if (!params) throw new Error("Unsupported password-hash parameters.");
  const salt = crypto.randomBytes(SALT_BYTES);
  const key = await scryptAsync(text, salt, params);
  return { algo: ALGO, N: params.N, r: params.r, p: params.p, keyLen: params.keyLen, salt: salt.toString("base64"), hash: key.toString("base64") };
}

/** Constant-time verification against a stored record. Any malformed input → false. */
async function verifySecret(secret, record) {
  try {
    const text = String(secret ?? "");
    if (!text || text.length > MAX_SECRET_LENGTH) return false;
    if (!record || record.algo !== ALGO) return false;
    const params = acceptedParams(record);
    if (!params) return false;
    const salt = Buffer.from(String(record.salt || ""), "base64");
    const expected = Buffer.from(String(record.hash || ""), "base64");
    if (salt.length < SALT_BYTES || expected.length !== params.keyLen) return false;
    const derived = await scryptAsync(text, salt, params);
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** True when a stored record is weaker than today's defaults (re-hash on the next successful login). */
function needsRehash(record) {
  const params = acceptedParams(record);
  if (!params || record.algo !== ALGO) return true;
  return params.N < DEFAULT_PARAMS.N || params.keyLen < DEFAULT_PARAMS.keyLen;
}

module.exports = { ALGO, DEFAULT_PARAMS, MAX_SECRET_LENGTH, hashSecret, verifySecret, needsRehash, acceptedParams };
