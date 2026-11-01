const crypto = require("crypto");

// Tadris+ P1-A — one-time recovery codes for the owner's second factor (owner decision D4).
// Ten codes of 12 Crockford-style base32 characters (60 bits each), shown ONCE; only SHA-256 hashes are stored. 60 random
// bits make a fast hash appropriate (the code is not a human-chosen password). A used code is marked, never reusable.

const COUNT = 10;
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ0123456789"; // no I, L, O, U (no 0/O or 1/I confusion)

function normalizeRecoveryCode(code) {
  return String(code ?? "").toUpperCase().replace(/[\s-]/g, "");
}

function hashRecoveryCode(code) {
  return crypto.createHash("sha256").update("ExamBank791381:recovery-code:v1\n" + normalizeRecoveryCode(code)).digest("hex");
}

function generateOne() {
  const bytes = crypto.randomBytes(12);
  let raw = "";
  for (const b of bytes) raw += ALPHABET[b & 31];
  return raw.slice(0, 4) + "-" + raw.slice(4, 8) + "-" + raw.slice(8, 12);
}

/** → { codes: string[] (show once), records: [{ hash, usedAt: null }] (store) }. */
function generateRecoveryCodes(count = COUNT) {
  const codes = [];
  while (codes.length < count) {
    const c = generateOne();
    if (!codes.includes(c)) codes.push(c);
  }
  return { codes, records: codes.map(c => ({ hash: hashRecoveryCode(c), usedAt: null })) };
}

/** Index of the unused record matching `code`, or -1. Compares every record in constant time per record. */
function findUnusedRecoveryCode(records, code) {
  const normalized = normalizeRecoveryCode(code);
  if (!/^[A-Z0-9]{12}$/.test(normalized) || !Array.isArray(records)) return -1;
  const target = Buffer.from(hashRecoveryCode(normalized), "hex");
  let found = -1;
  records.forEach((record, index) => {
    const candidate = Buffer.from(String(record?.hash || ""), "hex");
    const equal = candidate.length === target.length && crypto.timingSafeEqual(candidate, target);
    if (equal && !record.usedAt && found === -1) found = index;
  });
  return found;
}

function remainingRecoveryCodes(records) {
  return Array.isArray(records) ? records.filter(r => r && r.hash && !r.usedAt).length : 0;
}

module.exports = { COUNT, normalizeRecoveryCode, hashRecoveryCode, generateRecoveryCodes, findUnusedRecoveryCode, remainingRecoveryCodes };
