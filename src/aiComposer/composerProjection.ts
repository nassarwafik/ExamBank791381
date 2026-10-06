// Phase 20F — AiSafeExamProjectionV1: what the model may see of an EXISTING exam, built by ALLOW-LIST (never by deleting secrets from a
// copy): identities, numbers, types / versions, marks, the public stem text (bounded), public option texts of in-scope questions, the outline
// of composite parts, the simulator identity, coverage topics. NEVER: any `answer` (correct options, accepted values, rubrics, guidance,
// model answers, private SmartSim checks, coding hidden tests / reference solutions / grading mode), media data URLs, metadata other than
// coverage topics, governance / audit fields, or any student data (an exam holds none; nothing outside the allow-list can be copied).
// Purpose-specific: out-of-scope questions are reduced to an outline; the whole projection is byte-bounded.
import { richContentPlainText } from "../richContent/richContentModel";
import type { StructuredExam } from "../examTypes";
import { COMPOSER_LIMITS } from "./composerLimits";
import { composerMetadataOf } from "./composerExam";
import { jsonBytes } from "./composerSchemaKit";

type Rec = Record<string, unknown>;
export type ComposerScope = { kind: "exam" } | { kind: "section"; sectionId: string } | { kind: "question"; questionId: string } | { kind: "presentation" };
export type ProjectedQuestion = {
  id: string; number: string; type: string; version: number; marks: number; text: string; topic?: string; richSummary?: string;
  options?: string[]; parts?: { id: string; label: string; type: string; marks: number; text: string }[];
  context?: { kind: string; plugin?: string; title?: string }; simulator?: string; codingLanguages?: string[]; imageRequest?: string; outlineOnly?: boolean;
};
export type AiSafeExamProjectionV1 = { v: 1; title: string; preset: string | null; direction: string | null; sections: { id: string; title: string; instructions: string; marks: number; questions: ProjectedQuestion[] }[] };

const clip = (s: unknown, n: number) => { const t = typeof s === "string" ? s : ""; return t.length > n ? t.slice(0, n) + "…" : t; };
const str = (v: unknown) => (typeof v === "string" ? v : "");
function inScope(scope: ComposerScope, sectionId: string, questionId: string): boolean {
  if (scope.kind === "exam") return true;
  if (scope.kind === "section") return scope.sectionId === sectionId;
  if (scope.kind === "question") return scope.questionId === questionId;
  return false;
}
function projectQuestion(q: Rec, number: string, full: boolean, topic: string | undefined): ProjectedQuestion {
  const base: ProjectedQuestion = { id: str(q.examQuestionId), number, type: str(q.presentationType), version: typeof q.questionTypeVersion === "number" ? q.questionTypeVersion : 1, marks: Number(q.marks) || 0, text: clip(q.text, full ? 3000 : 160) };
  if (topic) base.topic = topic;
  if (!full) return { ...base, outlineOnly: true };
  if (q.richContent !== undefined) { const t = richContentPlainText(q.richContent); if (t) base.richSummary = clip(t, 1500); }
  if (Array.isArray(q.options)) base.options = q.options.slice(0, 12).map(o => clip(o && typeof o === "object" ? (o as Rec).text : o, 300));
  const sim = q.smartSim as Rec | undefined;
  if (sim && typeof sim === "object") base.simulator = str(sim.pluginKey) + "@" + String(sim.pluginVersion);
  const coding = q.coding as Rec | undefined;
  if (coding && Array.isArray(coding.allowedLanguages)) base.codingLanguages = (coding.allowedLanguages as unknown[]).map(str).slice(0, 3);
  const ar = q.assetRequest as Rec | undefined;
  if (ar && typeof ar.description === "string") base.imageRequest = clip(ar.description, 300);
  const comp = q.composite as Rec | undefined;
  if (comp && typeof comp === "object") {
    const ctx = Array.isArray(comp.contexts) ? (comp.contexts as Rec[])[0] : undefined;
    if (ctx) base.context = { kind: str(ctx.kind), ...(ctx.smartSim ? { plugin: str((ctx.smartSim as Rec).pluginKey) + "@" + String((ctx.smartSim as Rec).pluginVersion) } : {}), ...(ctx.title ? { title: clip(ctx.title, 200) } : {}) };
    base.parts = (Array.isArray(comp.groups) ? (comp.groups as Rec[]) : []).flatMap(g => (Array.isArray(g.parts) ? (g.parts as Rec[]) : [])).slice(0, 40)
      .map(p => ({ id: str(p.id), label: clip(p.label, 40), type: str(p.type), marks: Number(p.marks) || 0, text: clip(p.text, 600) }));
  }
  return base;
}

/** The purpose-specific projection; `null` when even the outline exceeds the AI context bound. */
export function buildAiSafeProjection(exam: StructuredExam, scope: ComposerScope): AiSafeExamProjectionV1 | null {
  const meta = composerMetadataOf(exam);
  const topicOf = (id: string) => meta?.coverage.find(c => c.questionId === id)?.topic;
  const pres = exam.presentation as Rec | undefined;
  let n = 0;
  const build = (fullTexts: boolean): AiSafeExamProjectionV1 => ({
    v: 1, title: clip(exam.title, 200), preset: pres && typeof pres.preset === "string" ? pres.preset : null, direction: pres && typeof pres.direction === "string" ? pres.direction : null,
    sections: (exam.sections || []).map(s => ({
      id: str(s.id), title: clip(s.title, 200), instructions: clip(s.instructions, 600),
      marks: (s.questions || []).reduce((t, q) => t + (Number(q.marks) || 0), 0),
      questions: (s.questions || []).map(q => { n++; const id = str(q.examQuestionId); return projectQuestion(q as unknown as Rec, str(q.displayNumber) || String(n), fullTexts || inScope(scope, str(s.id), id), topicOf(id)); })
    }))
  });
  n = 0;
  let p = build(scope.kind === "exam");
  if (jsonBytes(p) <= COMPOSER_LIMITS.aiContextBytes) return p;
  n = 0;
  p = build(false);
  return jsonBytes(p) <= COMPOSER_LIMITS.aiContextBytes ? p : null;
}

/** Defence in depth: refuses a serialized model payload that carries any private-authority or student-data marker. */
export const FORBIDDEN_AI_PAYLOAD = /"(?:answer|correctOptionIndex|correctOptionIds|correct|accepted|hiddenTests|referenceSolutions|expectedOutput|gradingMode|checks|expected|rubric|guidance|modelAnswer|targetState|studentId|studentAnswers?|attempts?|grades?|submissions?|dataUrl|blobName|token|secret|apiKey|password)"\s*:/;
export const payloadIsSafe = (payload: unknown): boolean => { try { return !FORBIDDEN_AI_PAYLOAD.test(JSON.stringify(payload)); } catch { return false; } };
