// Stage score primitives (dependency-free so the progress-transition module can validate a submitted score without
// a circular import of the performance calculator). A score is a finite number 0–100; anything else is rejected.
const SCORE_ERROR = "العلامة يجب أن تكون رقمًا بين 0 و 100.";

/** A finite number in 0..100, else null (never coerces junk to 0). */
function normalizeScore(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean" || typeof value === "object") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}
/** Server-authoritative validation for a submitted score: throws an httpStatus-400 error with the Arabic message. */
function validateScoreInput(value) {
  const n = normalizeScore(value);
  if (n === null) { const err = new Error(SCORE_ERROR); err.httpStatus = 400; throw err; }
  return n;
}

module.exports = { SCORE_ERROR, normalizeScore, validateScoreInput };
