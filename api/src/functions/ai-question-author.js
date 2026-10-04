const { app } = require("@azure/functions");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { callTextJson } = require("../lib/quality-fix-ai-client");
const { withObservability } = require("../lib/observability");
const draft = require("../lib/shared-finalization/aiQuestionDraft");

/*
 * Phase 19A — POST /api/ai-question-author: AI-assisted authoring of ONE question from a teacher's natural-language request.
 *
 * Contract: { request: string (1..2000 chars), preferredType?: one of the AI intent vocabulary } → 200 { ok: true, intent, question,
 * notes } | 200 { ok: false, code, message, intent?, issues } | 400 bad request | 401 (teacher session required) | 502 provider failure.
 *
 * The endpoint NEVER mutates or publishes an exam. The AI fills a strict json_schema (intent + the payload of that intent); the
 * SHARED deterministic normalizer (src/aiQuestionDraft.ts, the same code the Builder dialog re-runs) maps it to the canonical node of
 * its type and the SAME canonical validators manual authoring uses decide validity — an invalid draft is refused with their issues,
 * never repaired. networkCli is generated only inside the V1 managed-switch scope (routing / OSPF / ACL / … are refused even when the
 * model invents a switch contract); simulation / coding are recognised but never generated. The teacher inserts the returned
 * question as a DRAFT; finalization gates still apply. The configured OpenAI client (quality-fix-ai-client.js: OpenAI only, strict
 * structured output, no SDK retries) is reused unchanged — no new provider, no key on the frontend, no provider error text returned.
 */
const MAX_REQUEST_CHARS = draft.AI_AUTHOR_LIMITS.requestChars;
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
    if (typeof text !== "string" || text.trim() === "") return bad("اكتب وصفًا للسؤال المطلوب.");
    if (text.length > MAX_REQUEST_CHARS) return bad("الطلب أطول من الحد المسموح (" + MAX_REQUEST_CHARS + " حرف).");
    const preferred = body.preferredType;
    if (preferred !== undefined && preferred !== null && !(typeof preferred === "string" && draft.AI_AUTHOR_INTENTS.includes(preferred))) return bad("نوع السؤال المفضّل غير معروف.");

    const signals = draft.classifyAuthorRequest(text);
    const prompt = draft.buildAiAuthorPrompt(text, signals, typeof preferred === "string" ? preferred : undefined);
    let result;
    try {
      ({ result } = await ai({ instructions: "Return only the requested question draft JSON.", prompt, schema: draft.buildAiAuthorSchema(), schemaName: "ai_question_draft" }));
    } catch (e) {
      log("ai.question_author.provider_failed", { reason: e && e.name ? String(e.name) : "error" });
      return { status: 502, jsonBody: { ok: false, code: "AI_PROVIDER_FAILED", error: "تعذّر الوصول إلى خدمة الذكاء الاصطناعي حاليًا؛ أعد المحاولة لاحقًا." } };
    }
    const r = draft.normalizeAiQuestionDraft(result, { request: text });
    return { status: 200, jsonBody: r };
  } catch {
    return { status: 500, jsonBody: { ok: false, error: "تعذّر إنشاء السؤال حاليًا." } };
  }
}

app.http("aiQuestionAuthor", { methods: ["POST"], authLevel: "anonymous", route: "ai-question-author", handler: withObservability("ai-question-author", (request, deps) => handler(request, deps && deps.callTextJson ? deps : {})) });

module.exports = { handler, MAX_REQUEST_CHARS };
