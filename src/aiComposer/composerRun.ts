// Phase 20F — the CLIENT orchestration of the staged pipeline (no React): intent → plan (bounded repairs) → one call per section (bounded
// repairs) → local assembly → local RE-VERIFICATION with the same shared code (never trusting the server's staged draft) → a staged result
// the teacher reviews. Modify: one patch call (bounded repairs) → a staged patch + diff. Nothing here touches the Builder: the dialog applies
// a staged result only on the teacher's explicit action. Cancellation aborts the in-flight request and discards everything.
import type { StructuredExam } from "../examTypes";
import { COMPOSER_LIMITS, type ComposerIssue } from "./composerLimits";
import { normalizeComposerIntent, type AiExamIntentV1 } from "./composerIntent";
import { normalizePlanShape, validatePlan, planCoverage, type AiExamPlanV1 } from "./composerPlan";
import type { ComposerItemMeta } from "./composerDraft";
import { assembleComposerExam, verifyGeneratedExam, type ComposerVerdict } from "./composerExam";
import { isPatchShape, type AiExamPatchV1, type ComposerMode, type DiffEntry, buildPatchDiff } from "./composerPatch";
import type { ComposerScope } from "./composerProjection";
import type { BuilderSection } from "../examTypes";
import type { ComposerFailure } from "./composerState";

type Rec = Record<string, unknown>;
/** POSTs one stage to /api/ai-exam-composer; resolves with the JSON body, or rejects (transport / abort, or an HTTP error carrying `payload`). */
export type ComposerTransport = (body: Rec, signal?: AbortSignal) => Promise<Rec>;
export type StageReporter = (name: "planning" | "generating" | "validating" | "repairing", stage: string, detail?: string) => void;
export const STAGE_LABELS = Object.freeze({ intent: "تحليل طلب الامتحان", plan: "إنشاء خطة الامتحان", sections: "إنشاء الأسئلة", validate: "فحص البنية", repair: "إصلاح الأخطاء", ready: "جاهز للمراجعة", modify: "تحليل التعديل المطلوب" });

const failure = (kind: ComposerFailure["kind"], message: string, issues: ComposerIssue[] = []): ComposerFailure => ({ kind, message, issues: issues.slice(0, 40).map(i => ({ code: i.code, message: i.message })) });
export const newComposerNonce = (): string => {
  const a = new Uint32Array(2);
  (globalThis.crypto as Crypto).getRandomValues(a);
  return (a[0].toString(36) + a[1].toString(36)).replace(/[^a-z0-9]/g, "").slice(0, 12).padEnd(6, "0");
};
function classify(body: Rec | null): ComposerFailure {
  const code = String(body?.code ?? "");
  const msg = typeof body?.error === "string" ? body.error : "";
  const issues = Array.isArray(body?.issues) ? (body!.issues as ComposerIssue[]) : [];
  if (code === "RATE_LIMITED") return failure("rateLimited", msg || "طلبات كثيرة خلال وقت قصير؛ أعد المحاولة بعد قليل.");
  if (code === "AI_TIMEOUT") return failure("timeout", msg || "استغرق الذكاء الاصطناعي وقتًا طويلًا.");
  if (code === "AI_PROVIDER_FAILED" || code === "AI_UNAVAILABLE" || code === "INTERNAL") return failure("provider", msg || "خدمة الذكاء الاصطناعي غير متاحة حاليًا.");
  if (code === "AI_RESPONSE_MALFORMED") return failure("invalidResponse", "ردّ الذكاء الاصطناعي غير صالح.", issues);
  if (code === "PLAN_INVALID" || code === "SECTION_INVALID" || code === "PATCH_INVALID") return failure("validation", "لم يجتز اقتراح الذكاء الاصطناعي الفحوص بعد محاولات الإصلاح المسموحة.", issues);
  return failure("request", msg || "تعذّر تنفيذ الطلب.", issues);
}
const isAbort = (e: unknown) => !!e && typeof e === "object" && (e as { name?: string }).name === "AbortError";

/** One stage with bounded repairs: the previous rejected draft goes back with attempt + 1 (the server re-judges it from scratch). */
async function stageWithRepair(transport: ComposerTransport, base: Rec, signal: AbortSignal | undefined, onRepair: (attempt: number) => void): Promise<{ ok: true; body: Rec } | { ok: false; failure: ComposerFailure }> {
  let previous: unknown = null;
  for (let attempt = 0; attempt <= COMPOSER_LIMITS.repairAttempts; attempt++) {
    if (attempt > 0) onRepair(attempt);
    let body: Rec;
    try { body = await transport({ ...base, ...(previous !== null ? { previous } : {}), attempt }, signal); }
    catch (e) {
      // the App request helper REJECTS a 4xx / 5xx and attaches the JSON body as `payload`: that body is the composer's answer
      const p = !isAbort(e) && e && typeof e === "object" ? (e as { payload?: unknown }).payload : undefined;
      if (!p || typeof p !== "object") throw e;
      body = p as Rec;
    }
    if (body && body.ok === true) return { ok: true, body };
    const repairable = (body?.code === "PLAN_INVALID" || body?.code === "SECTION_INVALID" || body?.code === "PATCH_INVALID") && body.draft !== null && body.draft !== undefined;
    if (!repairable || attempt === COMPOSER_LIMITS.repairAttempts) return { ok: false, failure: classify(body) };
    previous = body.draft;
  }
  return { ok: false, failure: failure("validation", "تعذّر الإصلاح.") };
}

export type GenerationResult = { exam: StructuredExam; intent: AiExamIntentV1; plan: AiExamPlanV1; planRaw: unknown; verdict: ComposerVerdict; planWarnings: ComposerIssue[]; warnings: ComposerIssue[]; planCoverage: { topic: string; marks: number; items: number }[] };
export async function runGeneration(transport: ComposerTransport, intentInput: unknown, opts: { examId: string; signal?: AbortSignal; report: StageReporter; nonce?: string }): Promise<{ ok: true; result: GenerationResult } | { ok: false; failure: ComposerFailure }> {
  try {
    opts.report("planning", STAGE_LABELS.intent);
    const ir = normalizeComposerIntent(intentInput);
    if (!ir.ok) return { ok: false, failure: failure("request", "طلب الامتحان غير مكتمل.", ir.issues) };
    const intent = ir.intent;
    opts.report("planning", STAGE_LABELS.plan);
    const p = await stageWithRepair(transport, { stage: "plan", intent: intentInput }, opts.signal, a => opts.report("repairing", STAGE_LABELS.repair, "الخطة · محاولة " + a));
    if (!p.ok) return p;
    const planRaw = p.body.planRaw;
    const shape = normalizePlanShape(planRaw);
    const pv = shape.ok ? validatePlan(shape.plan, intent) : null;
    if (!shape.ok || !pv || pv.blocking.length) return { ok: false, failure: failure("invalidResponse", "الخطة المستلمة لم تجتز التحقق المحلي.", shape.ok ? pv!.blocking : shape.issues) };
    const plan = pv.plan;
    const nonce = opts.nonce ?? newComposerNonce();
    const sections: BuilderSection[] = [], meta: ComposerItemMeta[] = [], warnings: ComposerIssue[] = [];
    for (let i = 0; i < plan.sections.length; i++) {
      opts.report("generating", STAGE_LABELS.sections, "القسم " + (i + 1) + " من " + plan.sections.length + ": " + plan.sections[i].title);
      const s = await stageWithRepair(transport, { stage: "section", intent: intentInput, planRaw, sectionIndex: i, nonce }, opts.signal, a => opts.report("repairing", STAGE_LABELS.repair, "القسم " + (i + 1) + " · محاولة " + a));
      if (!s.ok) return s;
      sections.push(s.body.section as BuilderSection);
      meta.push(...((s.body.meta as ComposerItemMeta[]) ?? []));
      warnings.push(...((s.body.warnings as ComposerIssue[]) ?? []));
    }
    opts.report("validating", STAGE_LABELS.validate);
    const exam = assembleComposerExam({ examId: opts.examId, intent, plan, sections, meta });
    const verdict = verifyGeneratedExam(exam, intent, plan);
    return { ok: true, result: { exam, intent, plan, planRaw, verdict, planWarnings: pv.warnings, warnings, planCoverage: planCoverage(plan) } };
  } catch (e) {
    if (isAbort(e)) return { ok: false, failure: failure("cancelled", "أُلغي الطلب؛ لم يتغيّر الامتحان.") };
    return { ok: false, failure: failure("provider", "تعذّر الاتصال بالخادم.") };
  }
}

export type ModifyResult = { patch: AiExamPatchV1; diff: DiffEntry[]; warnings: ComposerIssue[] };
export async function runModify(transport: ComposerTransport, input: { exam: StructuredExam; mode: ComposerMode; scope: ComposerScope; instruction: string; signal?: AbortSignal; report: StageReporter; nonce?: string }): Promise<{ ok: true; result: ModifyResult } | { ok: false; failure: ComposerFailure }> {
  try {
    input.report("planning", STAGE_LABELS.modify);
    const r = await stageWithRepair(transport, { stage: "modify", exam: input.exam, mode: input.mode, scope: input.scope, instruction: input.instruction, nonce: input.nonce ?? newComposerNonce() }, input.signal, a => input.report("repairing", STAGE_LABELS.repair, "محاولة " + a));
    if (!r.ok) return r;
    input.report("validating", STAGE_LABELS.validate);
    const patch = r.body.patch;
    if (!isPatchShape(patch) || patch.mode !== input.mode) return { ok: false, failure: failure("invalidResponse", "اقتراح التعديل المستلم غير صالح.") };
    return { ok: true, result: { patch, diff: buildPatchDiff(input.exam, patch), warnings: (r.body.warnings as ComposerIssue[]) ?? [] } };
  } catch (e) {
    if (isAbort(e)) return { ok: false, failure: failure("cancelled", "أُلغي الطلب؛ لم يتغيّر الامتحان.") };
    return { ok: false, failure: failure("provider", "تعذّر الاتصال بالخادم.") };
  }
}
