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

// Tadris+ P7-B1 — STRICT variants for an action that must not happen unrecorded (D14: the owner reading a conversation): a write
// failure throws, so the caller refuses the action instead of performing it silently.
async function recordAuditEventStrict(container, event) {
  return writeAuditEvent(container, event, AUDIT_PREFIX, { strict: true });
}
async function recordOwnerAuditEventStrict(container, event) {
  return writeAuditEvent(container, { actor: "system", ...event }, OWNER_AUDIT_PREFIX, { strict: true });
}

async function writeAuditEvent(container, event, prefix, { strict = false } = {}) {
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
      details: event?.details && typeof event.details === "object" ? event.details : {},
      // Tadris+ P7-B1 — an event about a teacher that the teacher did not perform (D14), shown in THAT teacher's activity log.
      ...(typeof event?.forTeacher === "string" && event.forTeacher ? { forTeacher: event.forTeacher } : {}),
      // Tadris+ P10-L — the owner change this event belongs to (recordOwnerChange): its record and, if any, its «not applied».
      ...(typeof event?.opId === "string" && OP_ID_RE.test(event.opId) ? { opId: event.opId } : {})
    });
  } catch (e) {
    // Recording the event must never break the sensitive action it's describing — unless the caller asked for a strict write.
    if (strict) throw e;
  }
}

// ── Tadris+ P10-L — every owner change is recorded BEFORE it happens (closes O14; design docs/enterprise-strict-owner-audit-p10l.md,
// owner decision §19.49: «صارم لكل تغيير، لا للدخول»). Recording after the change and refusing when that fails would report a failure
// for a change that already happened, so the order is: record (strict) → change → if the change did not apply, mark it.
const OP_ID_RE = /^op_[0-9a-f]{16}$/;
const AUDIT_UNAVAILABLE_ERROR = "تعذّر تسجيل العملية، فلم تُنفَّذ. أعد المحاولة.";
const auditUnavailable = () => ({ status: 503, headers: { "Cache-Control": "no-store" }, jsonBody: { ok: false, code: "AUDIT_UNAVAILABLE", error: AUDIT_UNAVAILABLE_ERROR } });

/**
 * Records an owner change, then performs it.
 *   1. `event` is written STRICTLY under the owner prefix with a fresh `opId` (`write` = the route's owner-audit writer, so a test
 *      seam keeps working). A failed write → 503 AUDIT_UNAVAILABLE and `apply` is NEVER called: nothing changes.
 *   2. `apply(opId)` runs the change exactly as before and returns the route's response.
 *   3. If it threw, answered ≥ 400, or answered with `notApplied: "<reason>"` (a success that changed nothing, e.g. an idempotent
 *      repeat — the field is removed), a best-effort `<action>.not-applied` event with the same opId is added; the response (or the
 *      error) is passed on unchanged.
 * Every check that writes nothing (session, step-up, input, reads) stays BEFORE this call, so a refused request records nothing.
 */
async function recordOwnerChange(container, event, apply, { write = recordOwnerAuditEventStrict } = {}) {
  const opId = "op_" + crypto.randomBytes(8).toString("hex");
  const recorded = { actor: "system", ...event, opId };
  try { await write(container, recorded); } catch { return auditUnavailable(); }
  const notApplied = async reason => {
    try {
      await write(container, { actor: recorded.actor, action: recorded.action + ".not-applied", targetType: recorded.targetType || "", targetId: recorded.targetId || "", targetLabel: recorded.targetLabel || "", opId, details: { reason } });
    } catch { /* the change did not happen; its «not applied» mark is best effort */ }
  };
  let response;
  try { response = await apply(opId); } catch (e) { await notApplied("error"); throw e; }
  if (response && typeof response.notApplied === "string") {   // a successful answer that changed nothing (an idempotent repeat)
    const { notApplied: reason, ...rest } = response;
    await notApplied(reason);
    return rest;
  }
  if (!response || Number(response.status) >= 400) await notApplied(String(response && response.jsonBody && response.jsonBody.code || (response && response.status) || "refused"));
  return response;
}

// Blob-client methods that write. A guarded container lets reads through untouched and makes the FIRST of these wait for the record.
const WRITE_METHODS = new Set(["upload", "uploadData", "uploadFile", "uploadStream", "stageBlock", "commitBlockList", "delete", "deleteIfExists", "setMetadata", "setHTTPHeaders", "syncCopyFromURL", "beginCopyFromURL"]);
class AuditUnavailableError extends Error { constructor() { super("owner audit unavailable"); this.code = "AUDIT_UNAVAILABLE"; } }

function writeGuardedContainer(container, beforeWrite) {
  const guard = (client, name) => new Proxy(client, {
    get(t, k) {
      const v = t[k];
      if (typeof v !== "function") return v;
      if (WRITE_METHODS.has(k)) return async (...args) => { await beforeWrite(String(name || ""), args[0]); return v.apply(t, args); };
      return v.bind(t);
    }
  });
  return new Proxy(container, {
    get(t, k) {
      const v = t[k];
      if (k === "getBlockBlobClient" || k === "getBlobClient") return (...args) => guard(v.apply(t, args), args[0]);
      return typeof v === "function" ? v.bind(t) : v;
    }
  });
}

/**
 * Tadris+ P10-L — the same guarantee for a change made by a SHARED library that refuses, or finds nothing to change, only after
 * reading (class labels and lifecycle, adding / importing students): `apply(guardedContainer, opId)` runs with a container whose
 * FIRST write waits for the strict record of `event`. A refusal or a no-op that writes nothing records nothing; a failed record
 * stops that write and every later one (503 AUDIT_UNAVAILABLE); a change that wrote and then answered ≥ 400 gets `.not-applied`.
 * `event` may be a function of the first write ({ name, json }) when the record names what is being written.
 */
async function recordOwnerChangeAtWrite(container, event, apply, { write = recordOwnerAuditEventStrict } = {}) {
  const opId = "op_" + crypto.randomBytes(8).toString("hex");
  let recorded = null, failed = false, last = null;
  const ensure = (name, body) => {
    if (!recorded) {
      let json = null;
      try { json = typeof body === "string" ? JSON.parse(body) : null; } catch { json = null; }
      recorded = (async () => {
        last = { actor: "system", ...(typeof event === "function" ? await event({ name, json }) : event), opId };
        await write(container, last);
      })().catch(() => { failed = true; throw new AuditUnavailableError(); });
    }
    return recorded;
  };
  const notApplied = async reason => {
    if (!last || failed) return;
    try { await write(container, { actor: last.actor, action: last.action + ".not-applied", targetType: last.targetType || "", targetId: last.targetId || "", targetLabel: last.targetLabel || "", opId, details: { reason } }); } catch { /* best effort */ }
  };
  let response;
  try { response = await apply(writeGuardedContainer(container, ensure), opId); } catch (e) {
    if (failed || e instanceof AuditUnavailableError) return auditUnavailable();
    await notApplied("error");
    throw e;
  }
  if (failed) return auditUnavailable();
  if (response && typeof response.notApplied === "string") { const { notApplied: reason, ...rest } = response; await notApplied(reason); return rest; }
  if (!response || Number(response.status) >= 400) await notApplied(String(response && response.jsonBody && response.jsonBody.code || (response && response.status) || "refused"));
  return response;
}

module.exports = { recordAuditEvent, recordOwnerAuditEvent, recordAuditEventStrict, recordOwnerAuditEventStrict, recordOwnerChange, recordOwnerChangeAtWrite, AuditUnavailableError, auditUnavailable, AUDIT_UNAVAILABLE_ERROR, OP_ID_RE, AUDIT_PREFIX, OWNER_AUDIT_PREFIX };
