const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { getContainer } = require("../lib/platform-storage");
const { listActorTasks, TASK_STAGES } = require("../lib/governance-inbox");

// Phase 14B §32–§33 — /api/governance-inbox: MY review / approval / publishing tasks.
//
//   GET  ?stage=review|approve|publish|all&cursor=<n>&limit=<n>
//   POST { action: "list", stage, cursor, limit }
//
// The actor is ONLY the authenticated builder-token subject. `actorId` / `sub` / anything else in the query or body is never
// read to decide whose tasks are listed: Teacher A can never request Teacher B's inbox. Students and anonymous callers are
// denied by requireBuilderAuth (401). Every returned task was validated against the authoritative manifest by the lib; the
// response carries no revision bodies (the task view loads the immutable revision through /api/exam-governance).
function parseArgs(request, body) {
  const u = new URL(request.url);
  const src = key => (body && body[key] !== undefined ? body[key] : u.searchParams.get(key));
  const stage = String(src("stage") || "all").trim().toLowerCase();
  const cursorRaw = src("cursor"); const limitRaw = src("limit");
  const cursor = Number.isInteger(cursorRaw) ? cursorRaw : (cursorRaw !== null && cursorRaw !== undefined && String(cursorRaw).trim() !== "" && Number.isInteger(Number(cursorRaw)) ? Number(cursorRaw) : undefined);
  const limit = limitRaw !== null && limitRaw !== undefined ? Number(limitRaw) : undefined;
  return { stage, cursor, limit };
}

async function handler(request, deps = {}, obs = null) {
  const auth = (deps.requireBuilderAuth || requireBuilderAuth)(request);
  if (!auth.ok) return auth.response;
  const actorId = String(auth.user.sub);                                   // the ONE source of the inbox identity
  let body = null;
  if (request.method !== "GET") { try { const b = await request.json(); body = b && typeof b === "object" ? b : {}; } catch { body = {}; } }
  const { stage, cursor, limit } = parseArgs(request, body);
  if (stage !== "all" && !TASK_STAGES.includes(stage)) return { status: 400, jsonBody: { ok: false, code: "INVALID", error: "مرحلة غير معروفة." } };
  try {
    const container = (deps.getContainer || getContainer)();
    const r = await listActorTasks(container, actorId, { stage, cursor, limit }, { downloadJsonOrNull: deps.downloadJsonOrNull, listBlobNames: deps.listBlobNames });
    return { status: 200, headers: { "Cache-Control": "no-store" }, jsonBody: { ok: true, actorId, stage, items: r.items, nextCursor: r.nextCursor, counts: r.counts } };
  } catch (e) {
    if (obs) obs.logError("governance-inbox.error", e, { stage });
    return { status: 500, jsonBody: { ok: false, error: "تعذر تحميل مهام المراجعة حاليًا." } };
  }
}

app.http("governanceInbox", { methods: ["GET", "POST"], authLevel: "anonymous", route: "governance-inbox", handler: withObservability("governance-inbox", handler) });
module.exports = { handler };
