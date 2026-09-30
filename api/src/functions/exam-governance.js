const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { getContainer } = require("../lib/platform-storage");
const { isSafeExamId } = require("../lib/exam-governance-model");
const { resolveGovernanceCapabilities, describeCapabilitySource } = require("../lib/exam-governance-capabilities");
const GOV = require("../lib/exam-governance");

// Phase 14A — /api/exam-governance: the dedicated server API of the exam publishing authority (the generic
// /api/save-exam-artifact keeps saving working copies and has no governance authority).
//
//   GET  ?examId=…                       → status
//   POST { action, examId, … }           actions: status · revisions · revision · events · published ·
//                                                 enable · create-revision · submit-review · return-to-draft · approve · publish
//
// Every mutation needs { requestId, expectedStateVersion } (create-revision / enable also need { exam }). Identity and
// capabilities come from the builder token + server configuration only; nothing in the body is trusted for authority.
// HTTP mapping: 400 invalid · 401 unauthenticated · 403 capability · 404 not governed / missing revision ·
// 409 stale / illegal / conflict (the authoritative manifest is returned alongside) · 422 server finalization refused.
const MUTATIONS = new Set(["enable", "create-revision", "submit-review", "return-to-draft", "approve", "publish"]);
const TARGET_OF = { "submit-review": "in-review", approve: "approved", publish: "published", "return-to-draft": "draft" };

async function readBody(request) {
  if (request.method === "GET") {
    const u = new URL(request.url);
    return { action: "status", examId: u.searchParams.get("examId") || "" };
  }
  try { const b = await request.json(); return b && typeof b === "object" ? b : {}; } catch { return {}; }
}

async function handler(request, deps = {}, obs = null) {
  const auth = (deps.requireBuilderAuth || requireBuilderAuth)(request);
  if (!auth.ok) return auth.response;
  const container = (deps.getContainer || getContainer)();
  const body = await readBody(request);
  const action = String(body.action || "status").trim().toLowerCase();
  const examId = String(body.examId || "");
  if (!isSafeExamId(examId)) return { status: 400, jsonBody: { ok: false, code: "INVALID", error: "معرّف الامتحان غير صالح." } };
  const capabilities = resolveGovernanceCapabilities(auth.user, process.env);
  const capabilitySource = describeCapabilitySource(process.env);
  const actor = { id: String(auth.user.sub), capabilities };
  const libDeps = { now: deps.now, newId: deps.newId, finalize: deps.finalize };
  try {
    if (action === "status") {
      const s = await GOV.getGovernanceStatus(container, examId, libDeps);
      return { status: 200, jsonBody: { ok: true, governed: s.governed, manifest: GOV.publicManifest(s.manifest), capabilities, capabilitySource } };
    }
    if (action === "revisions") { const r = await GOV.listRevisions(container, { examId, cursor: body.cursor, limit: body.limit }, libDeps); return { status: 200, jsonBody: { ok: true, ...r } }; }
    if (action === "revision") { const revision = await GOV.loadRevision(container, { examId, revisionId: String(body.revisionId || "") }, libDeps); return { status: 200, jsonBody: { ok: true, revision } }; }
    if (action === "events") { const r = await GOV.listEvents(container, { examId, cursor: body.cursor, limit: body.limit }, libDeps); return { status: 200, jsonBody: { ok: true, ...r } }; }
    if (action === "published") { const revision = await GOV.loadPublishedRevision(container, examId, libDeps); return { status: 200, jsonBody: { ok: true, revision } }; }
    if (!MUTATIONS.has(action)) return { status: 400, jsonBody: { ok: false, code: "INVALID", error: "Unsupported governance action." } };
    const requestId = typeof body.requestId === "string" ? body.requestId : undefined;
    const expectedStateVersion = Number.isInteger(body.expectedStateVersion) ? body.expectedStateVersion : undefined;
    if (action === "enable") {
      const r = await GOV.enableGovernance(container, { examId, exam: body.exam, actor, requestId }, libDeps);
      return { status: 200, jsonBody: { ok: true, manifest: GOV.publicManifest(r.manifest), revision: r.meta || null, replayed: r.replayed, capabilities, capabilitySource } };
    }
    if (action === "create-revision") {
      const r = await GOV.createRevision(container, { examId, exam: body.exam, actor, requestId, expectedStateVersion }, libDeps);
      return { status: 200, jsonBody: { ok: true, manifest: GOV.publicManifest(r.manifest), revision: r.meta || null, created: r.created === true, replayed: r.replayed, capabilities, capabilitySource } };
    }
    const r = await GOV.transition(container, { examId, to: TARGET_OF[action], actor, requestId, expectedStateVersion, revisionId: typeof body.revisionId === "string" ? body.revisionId : undefined }, libDeps);
    return { status: 200, jsonBody: { ok: true, manifest: GOV.publicManifest(r.manifest), replayed: r.replayed, ...(r.decision ? { decision: r.decision } : {}), capabilities, capabilitySource } };
  } catch (e) {
    if (e instanceof GOV.GovernanceError) {
      const jsonBody = { ok: false, code: e.code, error: e.message };
      if (e.details !== undefined) jsonBody.details = e.details;
      if (e.status === 409 || e.status === 422) {
        // Hand the client the authoritative state so it can refresh instead of retrying blindly.
        try { const s = await GOV.getGovernanceStatus(container, examId, libDeps); jsonBody.manifest = GOV.publicManifest(s.manifest); } catch { /* the error response stands on its own */ }
      }
      return { status: e.status, jsonBody };
    }
    if (obs) obs.logError("exam-governance.error", e, { action });
    return { status: 500, jsonBody: { ok: false, error: "تعذر تنفيذ إجراء إدارة النشر حاليًا." } };
  }
}

app.http("examGovernance", { methods: ["GET", "POST"], authLevel: "anonymous", route: "exam-governance", handler: withObservability("exam-governance", handler) });
module.exports = { handler };
