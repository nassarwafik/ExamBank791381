const crypto = require("crypto");
const { uploadJson } = require("./platform-storage");

const AUDIT_PREFIX = "platform/audit/";
// Tadris+ P1-A — the platform owner's security events (bootstrap, sign-in, sessions, second factor) are written under a
// SEPARATE prefix: the teacher-facing reader (/api/audit-history) lists only AUDIT_PREFIX, so a teacher never sees when
// or how the owner signs in, and owner events never take a slot in the teacher's newest-100 window.
const OWNER_AUDIT_PREFIX = "platform/owner-audit/";

// One independent blob per event (never a shared/appended document), so concurrent sensitive
// actions never race on the same write — no ETag/retry logic is needed here at all. Audit logging
// is a secondary concern: a failure to record an event must never fail the action it describes, so
// every error is swallowed. There is no reader/UI yet (by design, per the current phase's scope) —
// entries are only meant to be listed under AUDIT_PREFIX later if/when one is built.
async function recordAuditEvent(container, event) {
  return writeAuditEvent(container, event, AUDIT_PREFIX);
}

async function recordOwnerAuditEvent(container, event) {
  return writeAuditEvent(container, { actor: "system", ...event }, OWNER_AUDIT_PREFIX);
}

async function writeAuditEvent(container, event, prefix) {
  try {
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, "-");
    const suffix = crypto.randomBytes(4).toString("hex");
    const name = prefix + stamp + "-" + suffix + ".json";
    await uploadJson(container, name, {
      schemaVersion: 1,
      timestamp: now.toISOString(),
      actor: String(event?.actor || "builder"),
      action: String(event?.action || ""),
      targetType: String(event?.targetType || ""),
      targetId: String(event?.targetId || ""),
      targetLabel: String(event?.targetLabel || ""),
      details: event?.details && typeof event.details === "object" ? event.details : {}
    });
  } catch {
    // Recording the event must never break the sensitive action it's describing.
  }
}

module.exports = { recordAuditEvent, recordOwnerAuditEvent, AUDIT_PREFIX, OWNER_AUDIT_PREFIX };
