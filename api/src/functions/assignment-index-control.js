// Phase 12E-B — the MIGRATION AUTHORITY switch of the per-class published-assignment index (teacher/builder only).
//
//   GET  /api/assignment-index-control                 → { ok, state: "migrating" | "authoritative" }
//   POST /api/assignment-index-control
//        { operation: "activate", confirm: "no-pre-index-writers" }   → authoritative, with a FRESH epoch
//        { operation: "deactivate" }                                  → migrating (always safe)
//
// Until activation the hot readers (student-dashboard, teacher-today) use the legacy global scan, which is correct
// whatever code version publishes. Activation asserts, explicitly, that NO pre-12E-B writer (an old instance, a
// long-running invocation, a preview/staging environment built from older code) can publish against this storage any
// more — nothing in storage can prove that, so it is an operator decision, never a timer. Every activation mints a new
// epoch: each class index is then reconciled once (one scan started after activation) before it is trusted.
// Deactivate BEFORE any rollback to pre-index code; re-activating afterwards forces a fresh reconcile of every class.
const { app } = require("@azure/functions");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { getContainer, StorageConflictError } = require("../lib/platform-storage");
const { recordAuditEvent } = require("../lib/audit-log");
const { withObservability } = require("../lib/observability");
const { readIndexControl, activateAssignmentIndex, deactivateAssignmentIndex } = require("../lib/class-assignment-index");

const CONFIRM = "no-pre-index-writers";
const CONFLICT_MESSAGE = "حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";
const stateOf = control => (control.authoritative ? "authoritative" : "migrating");

async function handler(request, deps = {}, obs = null) {
  const authFn = deps.requireBuilderAuth || requireBuilderAuth, getC = deps.getContainer || getContainer, rec = deps.recordAuditEvent || recordAuditEvent;
  try {
    const auth = authFn(request); if (!auth.ok) return auth.response;
    const c = getC();
    if (request.method === "GET") return { status: 200, jsonBody: { ok: true, state: stateOf(await readIndexControl(c, deps)) } };
    let body = {}; try { body = (await request.json()) || {}; } catch { body = {}; }
    const operation = String(body.operation || "");
    if (operation !== "activate" && operation !== "deactivate") return { status: 400, jsonBody: { ok: false, error: "العملية غير معروفة." } };
    if (operation === "activate" && body.confirm !== CONFIRM) return { status: 400, jsonBody: { ok: false, error: "يلزم تأكيد صريح بأن كل نسخ الخادم القديمة توقفت." } };
    const before = stateOf(await readIndexControl(c, deps));
    const after = stateOf(operation === "activate" ? await activateAssignmentIndex(c, deps) : await deactivateAssignmentIndex(c, deps));
    await rec(c, { actor: auth.user?.sub, action: "assignmentIndex." + operation, targetType: "assignmentIndex", targetId: "control", targetLabel: "", details: { previousState: before, state: after } });
    try { obs?.logInfo("assignment.index.control_changed", { operation, state: after }); } catch { /* inert */ }
    return { status: 200, jsonBody: { ok: true, state: after } };
  } catch (e) {
    if (e instanceof StorageConflictError) return { status: 503, jsonBody: { ok: false, error: CONFLICT_MESSAGE } };
    try { obs?.logError("assignment.index.control_error", e); } catch { /* inert */ }
    return { status: 500, jsonBody: { ok: false, error: "تعذر تنفيذ العملية حاليًا." } };
  }
}

app.http("assignmentIndexControl", { methods: ["GET", "POST"], authLevel: "anonymous", route: "assignment-index-control", handler: withObservability("assignment-index-control", handler) });
module.exports = { handler, CONFIRM };
