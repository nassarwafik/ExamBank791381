const { app } = require("@azure/functions");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { callTextJson } = require("../lib/quality-fix-ai-client");
const { withObservability } = require("../lib/observability");
const draft = require("../lib/shared-finalization/aiScenarioDraft");

/*
 * Phase 19G — POST /api/ai-scenario-author: AI-assisted authoring of ONE scenario (shared public sources + several ordinary questions
 * of one section) from a teacher's natural-language request.
 *
 * Contract: { request: string (1..2000 chars) } → 200 { ok: true, scenario, questions, notes } | 200 { ok: false, code, message, issues }
 * | 400 bad request | 401 (teacher session required) | 502 provider failure.
 *
 * The endpoint NEVER mutates or publishes an exam. The AI fills a strict json_schema (title, instructions, text / table / code sources
 * and the 19A per-question drafts); the SHARED deterministic normalizer (src/aiScenarioDraft.ts, the same code the Builder dialog
 * re-runs) maps the sources to the canonical SourceStimulusV1 contract, every question through the 19A single-question layer (no hidden
 * test, no reference solution, no visual geometry, no simulator package) and the whole section through the canonical finalization gate —
 * all or nothing. Image sources are never generated (no asset authority). The teacher inserts the result as a DRAFT; finalization gates
 * still apply. Same OpenAI-only strict client as 19A; no key on the frontend, no provider error text returned.
 */
const MAX_REQUEST_CHARS = draft.AI_SCENARIO_LIMITS.requestChars;
const bad = error => ({ status: 400, jsonBody: { ok: false, error } });

async function handler(request, deps = {}) {
  const authFn = deps.requireBuilderAuth || requireBuilderAuth;
  const ai = deps.callTextJson || callTextJson;
  const log = deps.log || (() => {});
  try {
    const auth = authFn(request);
    if (!auth.ok) return auth.response;

    let body = null;
    try { body = await request.json(); } catch { body = null; }
    if (!body || typeof body !== "object" || Array.isArray(body)) return bad("طلب غير صالح.");
    const text = body.request;
    if (typeof text !== "string" || text.trim() === "") return bad("اكتب وصفًا للسيناريو المطلوب.");
    if (text.length > MAX_REQUEST_CHARS) return bad("الطلب أطول من الحد المسموح (" + MAX_REQUEST_CHARS + " حرف).");
    for (const k of Object.keys(body)) if (k !== "request") return bad("طلب غير صالح.");

    const signals = draft.classifyAuthorRequest(text);
    const prompt = draft.buildAiScenarioPrompt(text, signals);
    let result;
    try {
      ({ result } = await ai({ instructions: "Return only the requested scenario draft JSON.", prompt, schema: draft.buildAiScenarioSchema(), schemaName: "ai_scenario_draft" }));
    } catch (e) {
      log("ai.scenario_author.provider_failed", { reason: e && e.name ? String(e.name) : "error" });
      return { status: 502, jsonBody: { ok: false, code: "AI_PROVIDER_FAILED", error: "تعذّر الوصول إلى خدمة الذكاء الاصطناعي حاليًا؛ أعد المحاولة لاحقًا." } };
    }
    const r = draft.normalizeAiScenarioDraft(result, { request: text });
    return { status: 200, jsonBody: r };
  } catch {
    return { status: 500, jsonBody: { ok: false, error: "تعذّر إنشاء السيناريو حاليًا." } };
  }
}

app.http("aiScenarioAuthor", { methods: ["POST"], authLevel: "anonymous", route: "ai-scenario-author", handler: withObservability("ai-scenario-author", (request, deps) => handler(request, deps && deps.callTextJson ? deps : {})) });

module.exports = { handler, MAX_REQUEST_CHARS };
