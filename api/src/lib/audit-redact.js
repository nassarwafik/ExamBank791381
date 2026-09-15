// Roadmap #19 — defensive recursive redaction for audit-event `details`.
//
// Audit events are written by trusted server code (audit-log.js) and are only ever read back by an
// authenticated builder/teacher, but a secret must NEVER live in the audit history regardless: a
// plaintext password, a password hash/salt, a session token, or an exam answer key does not belong in
// a durable log, even one only the teacher can read. `recordAuditEvent` call sites are already written
// to pass only safe aggregate details, so this is a SECOND, independent guard: even if a future call
// site accidentally puts a secret in `details`, the reader strips it before it reaches the client.
//
// The rule is a denylist of secret KEY-NAME HINTS matched by CONTAINMENT (case-insensitive,
// punctuation-insensitive), not exact equality — so a variant a future call site might use
// (`studentPassword`, `passwordSalt`, `sessionAuthToken`, `correctAnswers`, a nested `myPasswordHash`)
// is caught just as surely as the canonical name. This mirrors the observability layer's proven
// key-hint approach and the spirit of the student-exam sanitizer (a known-secret denylist walked
// recursively), so a secret nested inside an object/array can never slip through. The value under any
// key whose normalized form CONTAINS a hint is replaced with the REDACTED marker, at any depth.

const REDACTED = "[redacted]";

// Secret key-name hints (normalized to lowercase-alphanumeric). A key is redacted when its normalized
// form CONTAINS any hint. Covers credentials/auth material and exam answer keys / grading secrets.
// Chosen so no safe aggregate detail key (classId, createdCount, duplicateCount, failedCount, grade,
// graduationYear, programCodes, fromClassId, toClassId, allowedAttempts, dueAtOverride, attemptNumber,
// overriddenQuestions, newScore, *EndsAt, …) contains any of them.
const SECRET_KEY_HINTS = [
  // credentials / auth material
  "password", "passwd", "pwd", "hash", "salt",
  "token", "authorization", "bearer", "secret", "credential", "apikey",
  // exam answer keys / grading secrets (must never appear in a log)
  "answer", "correct", "solution", "modelanswer", "expected", "markscheme", "gradingkey"
];

function normalizeKey(key) {
  return String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSecretKey(key) {
  const norm = normalizeKey(key);
  return SECRET_KEY_HINTS.some(hint => norm.includes(hint));
}

// Deep-clone + redact. Never mutates the input. Depth-bounded so a pathological/cyclic-looking shape
// can't recurse without limit; anything past the bound is dropped to a safe marker.
function redactAuditDetails(value, depth = 0) {
  if (depth > 12) return REDACTED;
  if (Array.isArray(value)) return value.map(v => redactAuditDetails(v, depth + 1));
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value)) {
      if (isSecretKey(key)) { out[key] = REDACTED; continue; }
      out[key] = redactAuditDetails(value[key], depth + 1);
    }
    return out;
  }
  return value;
}

// Map a stored audit blob to the safe PUBLIC event model returned to the builder UI. Returns only the
// known display fields (never blob internals) and runs `details` through the recursive redactor.
function toPublicAuditEvent(stored, eventId) {
  const src = stored && typeof stored === "object" ? stored : {};
  return {
    eventId: String(eventId || ""),
    timestamp: String(src.timestamp || ""),
    actor: String(src.actor || ""),
    action: String(src.action || ""),
    targetType: String(src.targetType || ""),
    targetId: String(src.targetId || ""),
    targetLabel: String(src.targetLabel || ""),
    details: redactAuditDetails(src.details && typeof src.details === "object" ? src.details : {})
  };
}

module.exports = { redactAuditDetails, toPublicAuditEvent, isSecretKey, REDACTED };
