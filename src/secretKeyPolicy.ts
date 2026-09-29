// Phase 13C-A — Independent Review Fix 1 / R3. Canonical secret-key policy for the STUDENT-VISIBLE activity config.
//
// A key is judged by its CANONICAL form (lower-case, separators removed), never by exact spelling, so `correct_answer`,
// `CorrectAnswer`, `answer-key`, `Teacher Answer` … are all the same secret family. The policy is deliberately
// conservative: a false positive costs the teacher a rename; a false negative leaks a key to students.
//
// MIRROR: api/src/lib/secret-key-policy.js (the server sanitizer; CJS Azure Functions cannot import this TS module).
// src/secretKeyPolicy.parity.test.ts pins both implementations to the same families and the same verdicts.
export const SECRET_KEY_FAMILIES = [
  "answer", "correct", "solution", "hint", "teacher", "scoring", "grading", "secret", "rationale", "explanation",
  "aiinstruction", "expected", "rubric", "markscheme", "apikey", "token", "password", "credential"
] as const;
/** Canonical names that are secrets only as a WHOLE key (a substring match would be too broad, e.g. "monkey"). */
export const SECRET_KEY_EXACT = ["key", "history", "redostack"] as const;

export function normalizeConfigKey(key: unknown): string {
  return typeof key === "string" ? key.toLowerCase().replace(/[\s._-]+/g, "") : "";
}
export function isSecretConfigKey(key: unknown): boolean {
  const n = normalizeConfigKey(key);
  if (!n) return false;
  if ((SECRET_KEY_EXACT as readonly string[]).includes(n)) return true;
  for (const family of SECRET_KEY_FAMILIES) if (n.includes(family)) return true;
  return false;
}
