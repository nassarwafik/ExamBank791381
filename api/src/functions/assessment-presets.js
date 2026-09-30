const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { getContainer } = require("../lib/platform-storage");
const PRESETS = require("../lib/assessment-presets");

// Phase 15A — /api/assessment-presets: the signed-in teacher's PERSONAL Assessment Presets («قالب أكاديمي»).
//
//   POST { action: "list",   cursor?, limit?, q? }                      → { ok, items: [summary…], nextCursor }
//   POST { action: "load",   presetId }                                 → { ok, record }
//   POST { action: "create", preset }                                   → { ok, record }         (server mints id / owner / version / times)
//   POST { action: "update", presetId, expectedVersion, preset }        → { ok, record }         (ETag CAS; stale ⇒ 409 STALE_VERSION)
//   POST { action: "delete", presetId, expectedVersion }                → { ok, deleted: true }  (ETag CAS; stale ⇒ 409)
//
// The owner is ONLY the authenticated token subject (requireBuilderAuth — including the Phase 14B session binding); `ownerId`,
// `version`, `presetId` (on create), `createdAt` / `updatedAt` in a body are never read. Another teacher's preset is a plain
// not-found. Students / anonymous callers are 401. This endpoint is separate from the generic /api/save-exam-artifact (legacy
// `exam-template` blobs under templates/ are untouched) and holds no governance authority.
const ACTIONS = new Set(["list", "load", "create", "update", "delete"]);
const NO_STORE = { "Cache-Control": "no-store" };

async function handler(request, deps = {}, obs = null) {
  const auth = (deps.requireBuilderAuth || requireBuilderAuth)(request);
  if (!auth.ok) return auth.response;
  const ownerId = String(auth.user.sub);                                       // the ONE source of preset ownership
  let body = {};
  try { const b = await request.json(); body = b && typeof b === "object" ? b : {}; } catch { body = {}; }
  const action = String(body.action || "").trim().toLowerCase();
  if (!ACTIONS.has(action)) return { status: 400, headers: NO_STORE, jsonBody: { ok: false, code: "INVALID", error: "إجراء غير مدعوم." } };
  const libDeps = { now: deps.now, newId: deps.newId };
  try {
    const container = (deps.getContainer || getContainer)();
    const presetId = typeof body.presetId === "string" ? body.presetId : "";
    const expectedVersion = Number.isInteger(body.expectedVersion) ? body.expectedVersion : undefined;
    if (action === "list") {
      const r = await PRESETS.listPresets(container, { ownerId, cursor: Number.isInteger(body.cursor) ? body.cursor : undefined, limit: body.limit, q: typeof body.q === "string" ? body.q : "" }, libDeps);
      return { status: 200, headers: NO_STORE, jsonBody: { ok: true, items: r.items, nextCursor: r.nextCursor, total: r.total } };
    }
    if (action === "load") { const record = await PRESETS.loadPreset(container, { ownerId, presetId }, libDeps); return { status: 200, headers: NO_STORE, jsonBody: { ok: true, record } }; }
    if (action === "create") { const record = await PRESETS.createPreset(container, { ownerId, preset: body.preset }, libDeps); return { status: 200, headers: NO_STORE, jsonBody: { ok: true, record } }; }
    if (action === "update") { const record = await PRESETS.updatePreset(container, { ownerId, presetId, expectedVersion, preset: body.preset }, libDeps); return { status: 200, headers: NO_STORE, jsonBody: { ok: true, record } }; }
    const r = await PRESETS.deletePreset(container, { ownerId, presetId, expectedVersion }, libDeps);
    return { status: 200, headers: NO_STORE, jsonBody: { ok: true, deleted: true, presetId: r.presetId } };
  } catch (e) {
    if (e instanceof PRESETS.PresetError) {
      const jsonBody = { ok: false, code: e.code, error: e.message };
      if (e.issues) jsonBody.issues = e.issues;
      if (e.record) jsonBody.record = e.record;                                // the authoritative record on a stale update / delete
      return { status: e.status, headers: NO_STORE, jsonBody };
    }
    if (obs) obs.logError("assessment-presets.error", e, { action });
    return { status: 500, headers: NO_STORE, jsonBody: { ok: false, error: "تعذر تنفيذ إجراء القوالب الأكاديمية حاليًا." } };
  }
}

app.http("assessmentPresets", { methods: ["POST"], authLevel: "anonymous", route: "assessment-presets", handler: withObservability("assessment-presets", handler) });
module.exports = { handler };
