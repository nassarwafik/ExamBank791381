// Tadris+ P9-A1 — the owner's decision for every class WITHOUT an owner (blueprint §11.2 M7; owner decisions §19.33; the approved
// design docs/enterprise-legacy-ownership-p9a.md). Owner session only; every POST needs a recent second-factor check (step-up):
//
//   GET  /api/owner-legacy-classes            → { ok, visibilityToday, classes[] }   every unowned class, its counts, its decision
//   GET  /api/owner-legacy-classes/ledger     → { ok, ledgers[] }                     the decisions, newest first
//   POST /api/owner-legacy-classes/preview  { classId, decision, toAccountId? }        → { ok, plan }   a DRY RUN: nothing is written
//   POST /api/owner-legacy-classes/apply    { classId, decision, toAccountId?, reason, previewDigest, requestKey } → { ok, ledger }
//   POST /api/owner-legacy-classes/undo     { migrationId, reason }                    → { ok, ledger }
//
// decision: "assign" (a teacher), "shared" (stays as it is — the decision is recorded), "archive". The target teacher must be an
// existing teacher account that is not suspended (a console account or the imported workspace t_legacy). Every decision and undo is
// recorded in the owner's audit log (strict: one that cannot be recorded is answered 503 after the ledger, which keeps it) and, for a
// teacher who receives or loses a class, in that teacher's «سجل نشاطي» (forTeacher). Nothing here runs by itself.
const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { recordOwnerAuditEventStrict, recordAuditEvent } = require("../lib/audit-log");
const { requireOwnerSession, stepUpDenial, NO_STORE } = require("../lib/identity/owner-session");
const { isTeacherAccountId } = require("../lib/identity/teacher-token");
const { readTeacherAccount } = require("../lib/identity/teacher-accounts");
const { mutateJsonWithRetry } = require("../lib/platform-storage");
const { loadDocs } = require("../lib/classes-students-read-cache");
const { changeClassLifecycle } = require("./manage-classrooms");
const legacy = require("../lib/migrations/legacy-ownership");

const reply = (status, body) => ({ status, headers: NO_STORE, jsonBody: body });
const refusal = e => reply(e.status, { ok: false, code: e.code, error: e.message, ...e.extra });

async function handler(request, deps = {}, obs = null) {
  const nowMs = deps.now ? deps.now() : Date.now();
  const ownerAudit = deps.recordOwnerAuditEvent || recordOwnerAuditEventStrict;
  const teacherAudit = deps.recordAuditEvent || recordAuditEvent;
  const mut = deps.mutateJsonWithRetry || mutateJsonWithRetry;
  const ls = deps.listJson || loadDocs;
  const env = deps.tenancyEnv || process.env;   // LEGACY_DATA_OWNER (tests pass their own; deps.env belongs to the session check)
  const method = String(request.method || "GET").toUpperCase();
  const action = String(request.params?.action || "").toLowerCase();

  const auth = await requireOwnerSession(request, deps);
  if (!auth.ok) return auth.response;
  const { owner, session, container } = auth;
  const actor = "owner:" + owner.accountId;
  const libDeps = { ...deps, mutateJsonWithRetry: mut, listJson: ls, obs };

  try {
    if (method === "GET" && !action) return reply(200, { ok: true, ...(await legacy.inventory(container, libDeps, env)) });
    if (method === "GET" && action === "ledger") return reply(200, { ok: true, ledgers: await legacy.ledgerList(container, libDeps) });
    if (method !== "POST" || !["preview", "apply", "undo"].includes(action)) return reply(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });
    const denial = stepUpDenial(session, nowMs);
    if (denial) return denial;
    let body = {};
    try { const b = await request.json(); body = b && typeof b === "object" ? b : {}; } catch { body = {}; }

    // the teachers' own lifecycle function (pending-grading guards included), recorded in the owner's log
    const lifecycle = kind => classId => changeClassLifecycle(container, classId, kind, {
      mut, ls, actor,
      record: ev => ownerAudit(container, { actor, ...ev, action: "owner.legacy." + ev.action, details: { ...(ev.details || {}), legacy: true } })
    });

    if (action === "undo") {
      const r = await legacy.undo(container, { migrationId: String(body.migrationId || ""), reason: body.reason, actor, nowMs }, { ...libDeps, unarchiveClass: lifecycle("unarchive") });
      const l = r.ledger;
      await ownerAudit(container, { actor, action: "owner.legacy.class.undone", targetType: "class", targetId: l.classId, targetLabel: l.className, details: { migrationId: l.migrationId, decision: l.decision, to: l.to || "", reason: l.undoReason } });
      if (l.decision === "assign" && l.to) await teacherAudit(container, { actor: "owner", forTeacher: l.to, action: "owner.legacy.class.undone", targetType: "class", targetId: l.classId, targetLabel: l.className, details: { reason: l.undoReason } });
      return reply(200, { ok: true, ledger: l });
    }

    const classId = String(body.classId || "").trim(), decision = String(body.decision || "");
    const to = decision === "assign" ? String(body.toAccountId || "") : "";
    if (decision === "assign") {
      const teacher = isTeacherAccountId(to) ? await (deps.readTeacherAccount || readTeacherAccount)(container, to) : null;
      if (!teacher || teacher.role !== "teacher") return reply(400, { ok: false, code: "TARGET_INVALID", error: "حساب المعلم غير موجود." });
      if (teacher.status === "suspended") return reply(400, { ok: false, code: "TARGET_SUSPENDED", error: "حساب هذا المعلم موقوف. اختر معلمًا آخر." });
    }
    if (action === "preview") return reply(200, { ok: true, plan: await legacy.plan(container, { classId, decision, to }, libDeps, env) });

    const r = await legacy.apply(container, { classId, decision, to, reason: body.reason, previewDigest: String(body.previewDigest || ""), requestKey: String(body.requestKey || ""), actor, nowMs }, { ...libDeps, archiveClass: lifecycle("archive") }, env);
    const l = r.ledger;
    if (!r.duplicate) {
      const changed = l.changes.filter(c => c.outcome === "changed").length, failed = l.changes.filter(c => c.outcome === "failed").length;
      await ownerAudit(container, { actor, action: "owner.legacy.class.decided", targetType: "class", targetId: l.classId, targetLabel: l.className, details: { migrationId: l.migrationId, decision: l.decision, to: l.to || "", reason: l.reason, changed, failed, untouched: l.untouched.length } });
      if (l.decision === "assign" && l.status === "applied") await teacherAudit(container, { actor: "owner", forTeacher: l.to, action: "owner.legacy.class.assigned", targetType: "class", targetId: l.classId, targetLabel: l.className, details: { reason: l.reason } });
    }
    return reply(200, { ok: true, ledger: l, ...(r.duplicate ? { duplicate: true } : {}) });
  } catch (e) {
    if (e instanceof legacy.LegacyRefusal) return refusal(e);
    obs?.logError?.("owner.legacy.error", e, { action });
    return reply(503, { ok: false, code: "LEGACY_OWNERSHIP_UNAVAILABLE", error: "تعذر تنفيذ قرار الصف حاليًا. حاول مرة أخرى." });
  }
}

app.http("ownerLegacyClasses", { methods: ["GET", "POST"], authLevel: "anonymous", route: "owner-legacy-classes/{action?}", handler: withObservability("owner-legacy-classes", handler) });
module.exports = { handler };
