const { app } = require("@azure/functions");
const { withAiRateLimit } = require("../lib/ai-rate-limit");   // D3: per-teacher AI rate limit at registration
const { withObservability } = require("../lib/observability");
const { requireTeacherSession } = require("../lib/teacher-session");
const { requireCapability } = require("../lib/access/require-capability");
const { sessionGrants } = require("../lib/access/session-grants");
const { callTextJson } = require("../lib/quality-fix-ai-client");
const storage = require("../lib/platform-storage");
const { tenantOf, canAccessDocument } = require("../lib/teacher-tenancy");
const { normalizeClassStatus } = require("../lib/class-lifecycle");
const { isSafeId } = require("../lib/roster-input");
const { readApprovals } = require("../lib/gradebook/approval");
const { listClassSources } = require("../lib/gradebook/class-sources");
const ai = require("../lib/gradebook/ai-proposal");

/*
 * Class gradebook GB10 (docs/enterprise-class-gradebook-gb.md §4.11) — POST /api/gradebook-scheme-ai: «بناء المخطط بالذكاء الاصطناعي».
 *
 * Contract: { classId, description: string (1..2000 characters) } → 200 { ok: true, classId, proposal } | 200 { ok: false, code, message }
 * (the model understood no scheme, or answered malformed JSON) | 400 bad request | 401 | 403 CAPABILITY_DENIED | 404 CLASS_NOT_FOUND |
 * 409 CLASS_ARCHIVED / SCHEME_LOCKED | 429 RATE_LIMITED | 502 AI_PROVIDER_FAILED / AI_RESPONSE_INVALID | 503 | 504 AI_TIMEOUT.
 *
 * NOTHING is written: the proposal is loaded into the scheme builder, and the teacher saves it with the existing scheme.save (its
 * validation, its stale guard, its audit). The route is a proposal reader, like GB8's copy.
 *
 * Authority (AGENTS.md §10, owner decisions GB10): the teacher's session; BOTH capabilities — assignments.grading.grade (changing the
 * scheme is grading, owner decision O1) and examBuilder.ai.use (the owner's switch for AI authoring), asked one after the other at the
 * dispatch point; tenancy (another teacher's class is reported as missing, and nothing of it is read); an archived class or a scheme an
 * approval locks is refused before any provider call. Project sources only for a session that also holds projects.tracker.view.
 *
 * What reaches the model: the teacher's description and this class's sources under opaque references (lib/gradebook/ai-proposal.js) —
 * titles, total marks and publication dates. Never a student, a mark, an id, an answer key, or another class. The description is not
 * logged. The configured OpenAI client (quality-fix-ai-client.js: strict structured output, no SDK retries) is reused unchanged.
 */
const PROJECTS_CAPABILITY = "projects.tracker.view";
const CLASS_PREFIX = "platform/classes/";
const approvalsName = classId => "platform/gradebooks/" + classId + "/approvals.json";
const AI_TIMEOUT_MS = 25000;

const NO_STORE = { "Cache-Control": "no-store" };
const reply = (status, body) => ({ status, headers: NO_STORE, jsonBody: body });
const bad = (error, code = "INVALID_REQUEST") => reply(400, { ok: false, code, error });
const unavailable = () => reply(503, { ok: false, code: "GRADEBOOK_UNAVAILABLE", error: "تعذّر قراءة سجل العلامات الآن. أعد المحاولة بعد قليل." });
const isPlainObject = v => !!v && typeof v === "object" && !Array.isArray(v);
const isTimeout = e => !!e && (e.name === "APIConnectionTimeoutError" || e.name === "AbortError" || /timed? ?out/i.test(String(e.message || "")));

async function handler(request, deps = {}, obs = null) {
  const log = (event, fields) => { try { obs?.logWarn?.(event, fields); } catch { /* logging never changes the answer */ } };
  try {
    const auth = await requireTeacherSession(request, deps);
    if (!auth.ok) return auth.response;
    let capabilityDenial = await requireCapability(auth, "gradebook-scheme-ai.js", "*", deps, obs);
    if (capabilityDenial) return capabilityDenial;
    capabilityDenial = await requireCapability(auth, "gradebook-scheme-ai.js", "ai.use", deps, obs);
    if (capabilityDenial) return capabilityDenial;

    let body = null;
    try { body = await request.json(); } catch { body = null; }
    if (!isPlainObject(body)) return bad("طلب غير صالح.");
    const classId = String(body.classId || "");
    if (!isSafeId(classId)) return bad("classId غير صالح.");
    const description = typeof body.description === "string" ? body.description.trim() : "";
    if (!description) return bad("اكتب وصفًا لتوزيع العلامات.", "DESCRIPTION_REQUIRED");
    if (description.length > ai.AI_SCHEME_LIMITS.descriptionChars) return bad("الوصف أطول من الحد المسموح (" + ai.AI_SCHEME_LIMITS.descriptionChars + " حرف).", "DESCRIPTION_TOO_LONG");

    const c = deps.container || (deps.getContainer || storage.getContainer)();
    const dl = deps.downloadJsonOrNull || storage.downloadJsonOrNull;
    const classroom = await dl(c, CLASS_PREFIX + classId + ".json");
    if (!classroom || !canAccessDocument(classroom, tenantOf(auth.user))) return reply(404, { ok: false, code: "CLASS_NOT_FOUND", error: "الصف غير موجود." });
    if (normalizeClassStatus(classroom) === "archived") return reply(409, { ok: false, code: "CLASS_ARCHIVED", error: "الصف مؤرشف؛ سجل علاماته للقراءة فقط." });
    const grants = await (deps.sessionGrants || sessionGrants)(auth.user, deps, obs);
    if (!grants.ok) return grants.response;
    const approvals = readApprovals(await dl(c, approvalsName(classId)), classId);
    if (!approvals) return unavailable();                     // a corrupt approvals document is never read as «nothing approved»
    if (approvals.final || Object.keys(approvals.parts).length) {
      return reply(409, { ok: false, code: "SCHEME_LOCKED", error: "في المخطط أقسام معتمدة؛ أعد فتحها قبل بناء مخطط جديد." });
    }

    const sources = await listClassSources(c, classroom, grants.has(PROJECTS_CAPABILITY), deps);
    const refs = ai.buildSourceRefs(sources);
    let result;
    try {
      ({ result } = await (deps.callTextJson || callTextJson)({
        instructions: ai.AI_SCHEME_INSTRUCTIONS, prompt: ai.buildAiSchemePrompt(description, refs), schema: ai.buildAiSchemeSchema(),
        schemaName: "gradebook_scheme_proposal", timeoutMs: AI_TIMEOUT_MS
      }));
    } catch (e) {
      const timeout = isTimeout(e);
      log("gradebook.ai.provider_failed", { reason: timeout ? "timeout" : (e && e.name ? String(e.name) : "error") });
      return timeout
        ? reply(504, { ok: false, code: "AI_TIMEOUT", error: "استغرق الذكاء الاصطناعي وقتًا أطول من المسموح؛ اختصر الوصف أو أعد المحاولة." })
        : reply(502, { ok: false, code: "AI_PROVIDER_FAILED", error: "تعذّر الوصول إلى خدمة الذكاء الاصطناعي حاليًا؛ أعد المحاولة لاحقًا." });
    }
    const r = ai.normalizeAiScheme(result, refs);
    if (!r.ok) { log("gradebook.ai.no_scheme", { code: r.code }); return reply(200, r); }
    if (!ai.proposalIsSaveable(r.proposal, { classId, assignments: sources.documents, projectCodes: sources.projectCodes })) {
      log("gradebook.ai.invalid", { code: "AI_RESPONSE_INVALID" });
      return reply(502, { ok: false, code: "AI_RESPONSE_INVALID", error: "اقتراح الذكاء الاصطناعي غير صالح لهذا الصف؛ أعد المحاولة." });
    }
    log("gradebook.ai.proposed", { categories: r.proposal.categories.length, built: r.proposal.built, unmatched: r.proposal.unmatched.length });
    return reply(200, { ok: true, classId, proposal: r.proposal });
  } catch (e) {
    log("gradebook.ai.unavailable", { reason: e && e.code ? String(e.code) : "error" });
    return unavailable();
  }
}

app.http("gradebookSchemeAi", {
  methods: ["POST"], authLevel: "anonymous", route: "gradebook-scheme-ai",
  handler: withObservability("gradebook-scheme-ai", withAiRateLimit("gradebook-scheme-ai", "ai-general", (request, _azure, obs) => handler(request, {}, obs)))
});
module.exports = { handler };
