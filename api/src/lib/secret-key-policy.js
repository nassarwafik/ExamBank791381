// Phase 13C-A — Independent Review Fix 1 / R3. Canonical secret-key policy for the STUDENT-VISIBLE activity config.
// MIRROR of src/secretKeyPolicy.ts (same families, same normalization); src/secretKeyPolicy.parity.test.ts pins both.
// A key is judged by its canonical form (lower-case, separators removed): `correct_answer`, `CorrectAnswer`,
// `answer-key`, `Teacher Answer` … all belong to the same secret family. Conservative by design.
const SECRET_KEY_FAMILIES = [
  "answer", "correct", "solution", "hint", "teacher", "scoring", "grading", "secret", "rationale", "explanation",
  "aiinstruction", "expected", "rubric", "markscheme", "apikey", "token", "password", "credential"
];
const SECRET_KEY_EXACT = ["key", "history", "redostack"];

function normalizeConfigKey(key) {
  return typeof key === "string" ? key.toLowerCase().replace(/[\s._-]+/g, "") : "";
}
function isSecretConfigKey(key) {
  const n = normalizeConfigKey(key);
  if (!n) return false;
  if (SECRET_KEY_EXACT.includes(n)) return true;
  for (const family of SECRET_KEY_FAMILIES) if (n.includes(family)) return true;
  return false;
}

module.exports = { SECRET_KEY_FAMILIES, SECRET_KEY_EXACT, normalizeConfigKey, isSecretConfigKey };
