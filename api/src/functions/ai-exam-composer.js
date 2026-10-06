const { app } = require("@azure/functions");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { callTextJson } = require("../lib/quality-fix-ai-client");
const { withObservability } = require("../lib/observability");
const { getContainer } = require("../lib/platform-storage");
const { reserveComposerCall } = require("../lib/ai-composer-rate-limit");
const { COMPOSER_LIMITS } = require("../lib/shared-finalization/aiComposer/composerLimits");
const { normalizeComposerIntent } = require("../lib/shared-finalization/aiComposer/composerIntent");
const { buildPlanSchema, normalizePlanShape, validatePlan, planCoverage } = require("../lib/shared-finalization/aiComposer/composerPlan");
const { buildSectionDraftSchema, normalizeSectionDraft, isComposerNonce } = require("../lib/shared-finalization/aiComposer/composerDraft");
const { buildPatchSchema, normalizeComposerPatch, applyComposerPatch, buildPatchDiff, COMPOSER_MODES, modeScopeOk } = require("../lib/shared-finalization/aiComposer/composerPatch");
const { buildAiSafeProjection, payloadIsSafe } = require("../lib/shared-finalization/aiComposer/composerProjection");
const { buildPlanPrompt, buildSectionPrompt, buildModifyPrompt, buildRepairPrompt, COMPOSER_INSTRUCTIONS } = require("../lib/shared-finalization/aiComposer/composerPrompts");
const { detectUnsupportedCapabilities } = require("../lib/shared-finalization/aiComposer/composerCatalog");

/*
 * Phase 20F — POST /api/ai-exam-composer: the AI Full Exam Composer, ONE bounded provider call per request (the browser drives the staged
 * pipeline: plan → one call per section → bounded repairs; or one modify call), so no request approaches the Static Web Apps gateway limit.
 *
 *   { stage: "plan",    intent, previous?, attempt }                               → { ok, plan, planRaw, warnings, coverage } | { ok:false, code, issues, draft }
 *   { stage: "section", intent, planRaw, sectionIndex, nonce, previous?, attempt } → { ok, section, meta, warnings }           | { ok:false, code, issues, draft }
 *   { stage: "modify",  exam, mode, scope, instruction, nonce, previous?, attempt } → { ok, patch, diff, warnings }           | { ok:false, code, issues, draft }
 *
 * The endpoint NEVER saves, publishes, approves or assigns: it returns a STAGED draft / patch the teacher reviews in the Builder. Every model
 * output is untrusted: strict json_schema at the provider AND the shared deterministic normalizers (the same code the Builder re-runs)
 * decide; the client's echoed plan / previous draft is re-validated from scratch (never trusted); repair attempts are bounded server-side.
 * Modify sends the provider only the purpose-specific AI-safe projection (allow-listed: no answers, checks, hidden tests, rubrics, media
 * data or student data — a second guard refuses any forbidden marker). Teacher session required; per-teacher distributed rate limit (fail
 * closed); provider credentials stay server-side; provider errors are never echoed; logs carry bounded metadata only.
 */
const MAX_ATTEMPT = COMPOSER_LIMITS.repairAttempts;
const reply = (status, jsonBody, headers) => ({ status, jsonBody, ...(headers ? { headers } : {}) });
const bad = (code, error) => reply(400, { ok: false, code, error });
const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const TIMEOUT = { plan: 25000, section: 30000, modify: 30000 };
const issueList = issues => (Array.isArray(issues) ? issues.slice(0, 60) : []);
const draftOf = raw => { try { const s = JSON.stringify(raw); return s && s.length <= 400000 ? raw : null; } catch { return null; } };

function parseScope(raw, exam) {
  if (!isObj(raw)) return null;
  if (raw.kind === "exam" && Object.keys(raw).length === 1) return { kind: "exam" };
  if (raw.kind === "presentation" && Object.keys(raw).length === 1) return { kind: "presentation" };
  if (raw.kind === "section" && typeof raw.sectionId === "string" && Object.keys(raw).length === 2) return exam.sections.some(s => s.id === raw.sectionId) ? { kind: "section", sectionId: raw.sectionId } : null;
  if (raw.kind === "question" && typeof raw.questionId === "string" && Object.keys(raw).length === 2) return exam.sections.some(s => (s.questions || []).some(q => q.examQuestionId === raw.questionId)) ? { kind: "question", questionId: raw.questionId } : null;
  return null;
}

async function handler(request, deps = {}) {
  const authFn = deps.requireBuilderAuth || requireBuilderAuth;
  const ai = deps.callTextJson || callTextJson;
  const log = deps.log || (() => {});
  const now = deps.now || (() => new Date().toISOString());
  try {
    const auth = authFn(request);
    if (!auth.ok) return auth.response;

    let body = null;
    try {
      if (typeof request.text === "function") {
        const text = await request.text();
        if (typeof text !== "string" || Buffer.byteLength(text) > COMPOSER_LIMITS.requestBytes) return reply(413, { ok: false, code: "REQUEST_TOO_LARGE", error: "الطلب أكبر من الحد المسموح." });
        body = JSON.parse(text);
      } else body = await request.json();
    } catch { body = null; }
    if (!isObj(body)) return bad("REQUEST_INVALID", "طلب غير صالح.");
    const stage = body.stage;
    if (!["plan", "section", "modify"].includes(stage)) return bad("STAGE_UNKNOWN", "مرحلة غير معروفة.");
    const attempt = body.attempt === undefined ? 0 : body.attempt;
    if (!Number.isInteger(attempt) || attempt < 0 || attempt > MAX_ATTEMPT) return bad("REPAIR_LIMIT", "تجاوزت محاولات الإصلاح الحد المسموح (" + MAX_ATTEMPT + ").");
    const hasPrevious = body.previous !== undefined && body.previous !== null;
    if (hasPrevious && attempt < 1) return bad("REQUEST_INVALID", "مسودة سابقة بلا رقم محاولة إصلاح.");

    // ── build the stage: validate inputs (no provider call before this) ──
    let prompt, schema, schemaName, finish, previousIssues = null;
    const warnings = [];
    if (stage === "plan" || stage === "section") {
      const ir = normalizeComposerIntent(body.intent);
      if (!ir.ok) return reply(400, { ok: false, code: "INTENT_INVALID", error: "طلب الامتحان غير صالح.", issues: issueList(ir.issues) });
      const intent = ir.intent;
      if (stage === "plan") {
        const allowed = ["stage", "intent", "previous", "attempt"];
        if (Object.keys(body).some(k => !allowed.includes(k))) return bad("REQUEST_INVALID", "حقول غير معروفة في الطلب.");
        const judge = raw => {
          const shape = normalizePlanShape(raw);
          if (!shape.ok) return { ok: false, issues: shape.issues };
          const v = validatePlan(shape.plan, intent);
          return v.blocking.length ? { ok: false, issues: v.blocking } : { ok: true, plan: v.plan, warnings: v.warnings };
        };
        prompt = buildPlanPrompt(intent); schema = buildPlanSchema(); schemaName = "ai_exam_plan";
        finish = raw => { const j = judge(raw); return j.ok ? reply(200, { ok: true, plan: j.plan, planRaw: raw, warnings: j.warnings, coverage: planCoverage(j.plan) }) : reply(200, { ok: false, code: "PLAN_INVALID", issues: issueList(j.issues), draft: draftOf(raw) }); };
        if (hasPrevious) { const j = judge(body.previous); if (j.ok) return finish(body.previous); previousIssues = j.issues; }
      } else {
        const allowed = ["stage", "intent", "planRaw", "sectionIndex", "nonce", "previous", "attempt"];
        if (Object.keys(body).some(k => !allowed.includes(k))) return bad("REQUEST_INVALID", "حقول غير معروفة في الطلب.");
        const shape = normalizePlanShape(body.planRaw);
        const pv = shape.ok ? validatePlan(shape.plan, intent) : null;
        if (!shape.ok || !pv || pv.blocking.length) return bad("PLAN_INVALID", "خطة الامتحان غير صالحة؛ أعد إنشاءها.");
        const plan = pv.plan;
        const si = body.sectionIndex;
        if (!Number.isInteger(si) || si < 0 || si >= plan.sections.length) return bad("REQUEST_INVALID", "رقم القسم غير صالح.");
        if (!isComposerNonce(body.nonce)) return bad("REQUEST_INVALID", "معرّف التوليد غير صالح.");
        const judge = raw => normalizeSectionDraft(raw, plan.sections[si], si, { nonce: body.nonce });
        prompt = buildSectionPrompt(intent, plan, si); schema = buildSectionDraftSchema(); schemaName = "ai_exam_section";
        finish = raw => { const r = judge(raw); return r.ok ? reply(200, { ok: true, section: r.section, meta: r.meta, warnings: r.warnings }) : reply(200, { ok: false, code: "SECTION_INVALID", issues: issueList(r.issues), draft: draftOf(raw) }); };
        if (hasPrevious) { const r = judge(body.previous); if (r.ok) return finish(body.previous); previousIssues = r.issues; }
      }
    } else {
      const allowed = ["stage", "exam", "mode", "scope", "instruction", "nonce", "previous", "attempt"];
      if (Object.keys(body).some(k => !allowed.includes(k))) return bad("REQUEST_INVALID", "حقول غير معروفة في الطلب.");
      const exam = body.exam;
      if (!isObj(exam) || !Array.isArray(exam.sections) || typeof exam.examId !== "string") return bad("EXAM_INVALID", "الامتحان المرسل غير صالح.");
      if (!COMPOSER_MODES.includes(body.mode)) return bad("MODE_UNKNOWN", "نوع التعديل غير معروف.");
      const scope = parseScope(body.scope, exam);
      if (!scope || !modeScopeOk(body.mode, scope)) return bad("SCOPE_INVALID", "نطاق التعديل غير صالح.");
      const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
      if (!instruction) return bad("INSTRUCTION_REQUIRED", "اكتب ما تريد تعديله.");
      if (instruction.length > COMPOSER_LIMITS.instructionChars) return bad("INSTRUCTION_TOO_LONG", "التعليمات أطول من الحد المسموح (" + COMPOSER_LIMITS.instructionChars + " حرف).");
      if (!isComposerNonce(body.nonce)) return bad("REQUEST_INVALID", "معرّف التوليد غير صالح.");
      const projection = buildAiSafeProjection(exam, scope);
      if (!projection) return reply(413, { ok: false, code: "CONTEXT_TOO_LARGE", error: "الامتحان أكبر من أن يُرسل إلى الذكاء الاصطناعي؛ حدّد قسمًا أو سؤالًا." });
      if (!payloadIsSafe(projection)) { log("ai.composer.private_guard", { stage }); return reply(422, { ok: false, code: "PRIVATE_DATA_GUARD", error: "تعذّر تجهيز بيانات آمنة للذكاء الاصطناعي." }); }
      for (const u of detectUnsupportedCapabilities(instruction)) warnings.push({ code: "CAPABILITY_UNSUPPORTED", message: "الميزة المطلوبة «" + u.label + "» غير مدعومة في المحاكيات الحالية؛ لن تُنشأ محاكاة لها." });
      const ctx = { exam, mode: body.mode, scope, nonce: body.nonce, request: instruction };
      const judge = raw => {
        const n = normalizeComposerPatch(raw, ctx);
        if (!n.ok) return { ok: false, issues: n.issues };
        const dry = applyComposerPatch(exam, n.patch, { now: now(), request: instruction });
        return dry.ok ? { ok: true, patch: n.patch } : { ok: false, issues: dry.issues };
      };
      prompt = buildModifyPrompt(projection, body.mode, scope, instruction); schema = buildPatchSchema(); schemaName = "ai_exam_patch";
      finish = raw => { const j = judge(raw); return j.ok ? reply(200, { ok: true, patch: j.patch, diff: buildPatchDiff(exam, j.patch), warnings }) : reply(200, { ok: false, code: "PATCH_INVALID", issues: issueList(j.issues), draft: draftOf(raw), warnings }); };
      if (hasPrevious) { const j = judge(body.previous); if (j.ok) return finish(body.previous); previousIssues = j.issues; }
    }
    if (previousIssues) prompt = buildRepairPrompt(prompt, body.previous, previousIssues);

    // ── rate limit (fail closed), then ONE provider call ──
    let budget;
    try {
      const reserve = deps.reserveComposerCall || reserveComposerCall;
      const container = deps.container !== undefined ? deps.container : getContainer();
      budget = await reserve(container, String((auth.user && auth.user.sub) || "teacher"), deps);
    } catch { log("ai.composer.refused", { code: "AI_UNAVAILABLE", reason: "rate-limit-storage" }); return reply(503, { ok: false, code: "AI_UNAVAILABLE", error: "خدمة الذكاء الاصطناعي غير متاحة حاليًا." }); }
    if (!budget.allowed) return reply(429, { ok: false, code: "RATE_LIMITED", error: "طلبات كثيرة خلال وقت قصير؛ أعد المحاولة بعد قليل.", retryAfterSeconds: budget.retryAfterSeconds }, { "Retry-After": String(budget.retryAfterSeconds) });
    let result;
    try {
      ({ result } = await ai({ instructions: COMPOSER_INSTRUCTIONS, prompt, schema, schemaName, timeoutMs: TIMEOUT[stage] }));
    } catch (e) {
      const name = e && e.name ? String(e.name) : "error";
      const timeout = /timeout|abort/i.test(name);
      const malformed = e instanceof SyntaxError;
      log("ai.composer.provider_failed", { stage, reason: name });
      if (malformed) return reply(200, { ok: false, code: "AI_RESPONSE_MALFORMED", issues: [{ code: "AI_RESPONSE_MALFORMED", message: "ردّ الذكاء الاصطناعي ليس JSON صالحًا." }], draft: null });
      return reply(timeout ? 504 : 502, { ok: false, code: timeout ? "AI_TIMEOUT" : "AI_PROVIDER_FAILED", error: timeout ? "استغرق الذكاء الاصطناعي وقتًا أطول من المسموح؛ قلّل عدد الأسئلة في القسم أو أعد المحاولة." : "تعذّر الوصول إلى خدمة الذكاء الاصطناعي حاليًا؛ أعد المحاولة لاحقًا." });
    }
    log("ai.composer.completed", { stage, attempt });
    return finish(result);
  } catch {
    return reply(500, { ok: false, code: "INTERNAL", error: "تعذّر تنفيذ طلب المؤلف الآلي حاليًا." });
  }
}

app.http("aiExamComposer", { methods: ["POST"], authLevel: "anonymous", route: "ai-exam-composer", handler: withObservability("ai-exam-composer", (request, deps, obs) => handler(request, deps && deps.callTextJson ? deps : { log: obs && obs.logInfo ? (event, data) => obs.logInfo(event, data) : undefined })) });

module.exports = { handler };
