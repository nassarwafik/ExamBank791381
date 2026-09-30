const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { getContainer } = require("../lib/platform-storage");
const { isSafeExamId } = require("../lib/exam-governance-model");
const { resolveGovernanceCapabilities, describeCapabilitySource, isCapabilityConfigurationBroken, governanceWorkflowMode, governanceIdentityStatus, governanceDirectorySnapshot } = require("../lib/exam-governance-capabilities");
const { listGovernanceActors } = require("../lib/governance-directory");
const GOV = require("../lib/exam-governance");

// Phase 14A — /api/exam-governance: the dedicated server API of the exam publishing authority (the generic
// /api/save-exam-artifact keeps saving working copies and has no governance authority). Phase 14B adds the Assigned
// review workflow on the SAME endpoint and the same mutation authority.
//
//   GET  ?examId=…                       → status
//   POST { action, examId, … }           reads:     status · revisions · revision · events · published · decisions · decision · directory
//                                        mutations: enable · create-revision · submit-review (assignments in Assigned mode) ·
//                                                   return-to-draft · approve · publish ·
//                                                   complete-review · request-changes · reject-approval · reject-publication · withdraw-review
//
// Every mutation needs { requestId, expectedStateVersion } (create-revision / enable also need { exam }). Identity and
// capabilities come from the builder token + server configuration only; nothing in the body is trusted for authority — not
// role, capabilities, actorId, cycleId, reviewedBy / approvedBy / publishedBy, timestamps or display names. The client may
// only SELECT assignment ids (reviewerId / approverId / publisherId) and write a plain-text note; the server validates both.
// HTTP mapping: 400 invalid / note / assignment · 401 unauthenticated · 403 capability / not assigned · 404 not governed /
// missing revision / missing decision · 409 stale / illegal / conflict / workflow rule (the authoritative manifest is
// returned alongside) · 422 server finalization refused · 503 configuration invalid (capabilities or identity).
const MUTATIONS = new Set(["enable", "create-revision", "submit-review", "return-to-draft", "approve", "publish", ...GOV.WORKFLOW_ACTIONS]);
const TARGET_OF = { "submit-review": "in-review", approve: "approved", publish: "published", "return-to-draft": "draft" };
const WORKFLOW = new Set(GOV.WORKFLOW_ACTIONS);

async function readBody(request) {
  if (request.method === "GET") {
    const u = new URL(request.url);
    return { action: "status", examId: u.searchParams.get("examId") || "" };
  }
  try { const b = await request.json(); return b && typeof b === "object" ? b : {}; } catch { return {}; }
}
// Only the three assignment ids are read from the client selection — as strings — nothing else in the object is looked at.
function assignmentsOf(body) {
  const a = body && body.assignments;
  if (!a || typeof a !== "object" || Array.isArray(a)) return undefined;
  const id = v => (typeof v === "string" ? v.trim() : v);
  return { reviewerId: id(a.reviewerId), approverId: id(a.approverId), publisherId: id(a.publisherId) };
}

async function handler(request, deps = {}, obs = null) {
  const auth = (deps.requireBuilderAuth || requireBuilderAuth)(request);
  if (!auth.ok) return auth.response;
  const container = (deps.getContainer || getContainer)();
  const body = await readBody(request);
  const action = String(body.action || "status").trim().toLowerCase();
  const env = process.env;
  const capabilities = resolveGovernanceCapabilities(auth.user, process.env);
  const capabilitySource = describeCapabilitySource(process.env);
  const workflowMode = governanceWorkflowMode(env);
  const identity = governanceIdentityStatus(env);
  const actor = { id: String(auth.user.sub), capabilities };
  const common = { capabilities, capabilitySource, workflowMode, actorId: actor.id, ...(identity.ok ? {} : { identityConfigurationError: identity.code }) };
  const libDeps = { now: deps.now, newId: deps.newId, finalize: deps.finalize, directory: governanceDirectorySnapshot(env) };
  try {
    if (action === "directory") {
      const d = await listGovernanceActors(container, env, {});
      return { status: 200, jsonBody: { ok: true, mode: d.mode, actors: d.actors, ...common } };
    }
    const examId = String(body.examId || "");
    if (!isSafeExamId(examId)) return { status: 400, jsonBody: { ok: false, code: "INVALID", error: "معرّف الامتحان غير صالح." } };
    if (action === "status") {
      const s = await GOV.getGovernanceStatus(container, examId, libDeps);
      return { status: 200, jsonBody: { ok: true, governed: s.governed, manifest: GOV.publicManifest(s.manifest), ...common } };
    }
    if (action === "revisions") { const r = await GOV.listRevisions(container, { examId, cursor: body.cursor, limit: body.limit }, libDeps); return { status: 200, jsonBody: { ok: true, ...r } }; }
    if (action === "revision") { const revision = await GOV.loadRevision(container, { examId, revisionId: String(body.revisionId || "") }, libDeps); return { status: 200, jsonBody: { ok: true, revision } }; }
    if (action === "events") { const r = await GOV.listEvents(container, { examId, cursor: body.cursor, limit: body.limit }, libDeps); return { status: 200, jsonBody: { ok: true, ...r } }; }
    if (action === "decisions") { const r = await GOV.listDecisions(container, { examId, cursor: body.cursor, limit: body.limit }, libDeps); return { status: 200, jsonBody: { ok: true, ...r } }; }
    if (action === "decision") { const decision = await GOV.loadDecision(container, { examId, decisionId: String(body.decisionId || "") }, libDeps); return { status: 200, jsonBody: { ok: true, decision } }; }
    if (action === "published") { const revision = await GOV.loadPublishedRevision(container, examId, libDeps); return { status: 200, jsonBody: { ok: true, revision } }; }
    if (!MUTATIONS.has(action)) return { status: 400, jsonBody: { ok: false, code: "INVALID", error: "Unsupported governance action." } };
    // Review Fix 1 / Blocker 3: a malformed capability configuration fails SAFE — no mutation until an operator fixes it.
    if (isCapabilityConfigurationBroken(process.env)) return { status: 503, jsonBody: { ok: false, code: "GOVERNANCE_CONFIG_INVALID", error: "إعدادات صلاحيات إدارة النشر على الخادم غير صالحة (GOVERNANCE_CAPABILITIES). لا يمكن تنفيذ أي تعديل حتى يصحّحها المسؤول.", capabilitySource } };
    // 14B §8: Assigned mode without trustworthy server-owned identities fails CLOSED — never downgraded to single-teacher behaviour.
    if (!identity.ok) return { status: 503, jsonBody: { ok: false, code: identity.code, error: "وضع المراجعة المعيَّنة مفعَّل لكن دليل هويات المعلمين على الخادم غير صالح (BUILDER_USERS / GOVERNANCE_CAPABILITIES). لا يمكن تنفيذ أي تعديل حتى يصحّحه المسؤول.", ...common } };
    const requestId = typeof body.requestId === "string" ? body.requestId : undefined;
    const expectedStateVersion = Number.isInteger(body.expectedStateVersion) ? body.expectedStateVersion : undefined;
    const note = typeof body.note === "string" ? body.note : undefined;
    if (action === "enable") {
      const r = await GOV.enableGovernance(container, { examId, exam: body.exam, actor, requestId }, libDeps);
      return { status: 200, jsonBody: { ok: true, manifest: GOV.publicManifest(r.manifest), revision: r.meta || null, replayed: r.replayed, ...common } };
    }
    if (action === "create-revision") {
      const r = await GOV.createRevision(container, { examId, exam: body.exam, actor, requestId, expectedStateVersion }, libDeps);
      return { status: 200, jsonBody: { ok: true, manifest: GOV.publicManifest(r.manifest), revision: r.meta || null, created: r.created === true, replayed: r.replayed, ...common } };
    }
    if (WORKFLOW.has(action)) {
      const r = await GOV.workflowDecision(container, { examId, action, actor, requestId, expectedStateVersion, note }, libDeps);
      return { status: 200, jsonBody: { ok: true, manifest: GOV.publicManifest(r.manifest), replayed: r.replayed, ...(r.decisionId ? { decisionId: r.decisionId } : {}), ...common } };
    }
    const r = await GOV.transition(container, { examId, to: TARGET_OF[action], actor, requestId, expectedStateVersion, revisionId: typeof body.revisionId === "string" ? body.revisionId : undefined, assignments: action === "submit-review" ? assignmentsOf(body) : undefined, note: action === "approve" ? note : undefined }, libDeps);
    return { status: 200, jsonBody: { ok: true, manifest: GOV.publicManifest(r.manifest), replayed: r.replayed, ...(r.decision ? { decision: r.decision } : {}), ...(r.decisionId ? { decisionId: r.decisionId } : {}), ...common } };
  } catch (e) {
    if (e instanceof GOV.GovernanceError) {
      const jsonBody = { ok: false, code: e.code, error: e.message };
      if (e.details !== undefined) jsonBody.details = e.details;
      if (e.status === 409 || e.status === 422) {
        // Hand the client the authoritative state so it can refresh instead of retrying blindly.
        const examId = String(body.examId || "");
        try { if (isSafeExamId(examId)) { const s = await GOV.getGovernanceStatus(container, examId, libDeps); jsonBody.manifest = GOV.publicManifest(s.manifest); } } catch { /* the error response stands on its own */ }
      }
      return { status: e.status, jsonBody };
    }
    if (obs) obs.logError("exam-governance.error", e, { action });
    return { status: 500, jsonBody: { ok: false, error: "تعذر تنفيذ إجراء إدارة النشر حاليًا." } };
  }
}

app.http("examGovernance", { methods: ["GET", "POST"], authLevel: "anonymous", route: "exam-governance", handler: withObservability("exam-governance", handler) });
module.exports = { handler };
