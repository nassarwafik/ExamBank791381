// Roadmap #19 — defensive recursive redaction for audit-event `details`.
//
// Audit events are written by trusted server code (audit-log.js) and are only ever read back by an
// authenticated builder/teacher, but a secret must NEVER live in the audit history regardless: a
// plaintext password, a password hash/salt, a session token, or an exam answer key does not belong in
// a durable log, even one only the teacher can read. `recordAuditEvent` call sites are already written
// to pass only safe aggregate details, so this is a SECOND, independent guard: even if a future call
// site accidentally puts a secret in `details`, the reader strips it before it reaches the client.
//
// The rule is a denylist of secret KEY names (matched case-insensitively, punctuation-insensitively) —
// the value under any such key at any depth is replaced with the REDACTED marker. This mirrors the
// spirit of the student-exam sanitizer (a known-secret denylist walked recursively) rather than an
// allowlist, so a secret nested inside an object/array can never slip through.

const REDACTED = "[redacted]";

// Secret key names, normalized to lowercase-alphanumeric (so "password_hash", "passwordHash" and
// "PASSWORD-HASH" all collapse to the same token). Covers credentials, auth material, and grading keys.
const SECRET_KEYS = new Set([
  // credentials / auth material
  "password", "temporarypassword", "temppassword", "newpassword", "passwordhash", "passwordhashes",
  "salt", "salts", "token", "tokens", "sessiontoken", "authtoken", "accesstoken", "refreshtoken",
  "authorization", "bearer", "secret", "apikey", "credential", "credentials", "codehash",
  // exam answer keys / grading secrets (must never appear in a log)
  "answer", "answers", "correct", "iscorrect", "correcttext", "correctanswer", "correctanswers",
  "correctoption", "correctoptions", "correctoptionindex", "correctoptionvalue", "correctoptionlabel",
  "expectedanswer", "expected", "answerkey", "answerkeys", "solution", "modelanswer", "gradingkey"
]);

function normalizeKey(key) {
  return String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSecretKey(key) {
  return SECRET_KEYS.has(normalizeKey(key));
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
