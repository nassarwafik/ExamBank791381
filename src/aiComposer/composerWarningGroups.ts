// Phase 21S — the composer's warnings, grouped for the teacher's review. A warning that names a question (a 21Q quality check, a duplicate
// stem, an image request …) is listed under THAT question, in exam order, with its running number, the start of its stem and the exam
// that previews it alone; a warning without a question (plan / coverage / diversity) stays at exam level. Identical messages under the same
// question are shown once. A question id the exam does not hold (a stale or forged id) is never invented: its warning stays at exam level.
// Pure (no React): the dialog renders the result.
// Phase 21T — the same review for an AI modification: the selected operations are applied as a dry run (the real apply, nothing kept), the
// composer verdict before and after is compared, and only the warnings the change INTRODUCES are grouped — against the exam AFTER the
// change, so a group's number, excerpt and preview are those of the modified question. Warnings the change removes are counted.
import type { BuilderQuestion, BuilderSection, StructuredExam } from "../examTypes";
import type { AiExamIntentV1 } from "./composerIntent";
import { composerVerdict } from "./composerExam";
import { applyComposerPatch, type AiExamPatchV1 } from "./composerPatch";
import { COMPOSER_LIMITS } from "./composerLimits";

export type ComposerWarning = { message: string; code?: string; questionId?: string };
export type WarningGroup = { questionId: string; number: number; sectionTitle: string; excerpt: string; messages: string[]; preview: StructuredExam };
export type GroupedWarnings = { examLevel: string[]; questions: WarningGroup[]; total: number };

export const EXCERPT_CHARS = 70;
const excerptOf = (text: unknown) => { const t = String(text ?? "").replace(/\s+/g, " ").trim(); return t.length > EXCERPT_CHARS ? t.slice(0, EXCERPT_CHARS - 1) + "…" : t; };
const unique = (list: string[]) => [...new Set(list)];

/** A one-section exam wrapping one question (the builder's per-question student preview, same shape). */
export const singleQuestionExam = (exam: StructuredExam, section: BuilderSection, q: BuilderQuestion): StructuredExam => ({ ...exam, sections: [{ ...section, questions: [q] }] });

export function groupComposerWarnings(exam: StructuredExam, warnings: readonly ComposerWarning[]): GroupedWarnings {
  const where = new Map<string, { section: BuilderSection; question: BuilderQuestion; number: number }>();
  let n = 0;
  for (const section of exam.sections || []) for (const question of section.questions || []) where.set(question.examQuestionId, { section, question, number: ++n });
  const examLevel: string[] = [];
  const byQuestion = new Map<string, string[]>();
  for (const w of warnings) {
    if (w.questionId && where.has(w.questionId)) byQuestion.set(w.questionId, [...(byQuestion.get(w.questionId) ?? []), w.message]);
    else examLevel.push(w.message);
  }
  const questions = [...byQuestion.entries()]
    .map(([questionId, messages]) => { const at = where.get(questionId)!; return { questionId, number: at.number, sectionTitle: at.section.title || "", excerpt: excerptOf(at.question.text), messages: unique(messages), preview: singleQuestionExam(exam, at.section, at.question) }; })
    .sort((a, b) => a.number - b.number);
  const exams = unique(examLevel);
  return { examLevel: exams, questions, total: exams.length + questions.reduce((s, g) => s + g.messages.length, 0) };
}

const warningKey = (w: ComposerWarning) => (w.code ?? "") + "|" + (w.questionId ?? "") + "|" + w.message;
export type PatchWarningReview = { introduced: GroupedWarnings; resolved: number };
/** The warnings a modification introduces, grouped against the modified exam; null when the selection cannot be applied (stale / invalid / empty). */
export function reviewPatchWarnings(exam: StructuredExam, patch: AiExamPatchV1, opts: { selected: readonly number[]; intent?: AiExamIntentV1 | null }): PatchWarningReview | null {
  if (!opts.selected.length) return null;
  const r = applyComposerPatch(exam, patch, { selected: opts.selected, now: "1970-01-01T00:00:00.000Z", request: "" });
  if (!r.ok) return null;
  const before = composerVerdict(exam, { intent: opts.intent ?? null }).warnings;
  const after = composerVerdict(r.exam, { intent: opts.intent ?? null }).warnings;
  const had = new Set(before.map(warningKey)), has = new Set(after.map(warningKey));
  return { introduced: groupComposerWarnings(r.exam, after.filter(w => !had.has(warningKey(w)))), resolved: new Set(before.filter(w => !has.has(warningKey(w))).map(warningKey)).size };
}

// Phase 21V — «أعد توليد هذا السؤال»: the instruction a one-question replacement is asked with — the same idea, the same type and the
// same marks, and the question's own warnings to fix. Code-built (the teacher sees and can edit it in «السؤال المحدد»), bounded by the
// composer's instruction limit; the replacement still goes through the patch validator, the diff and an explicit «تطبيق».
export const REGENERATE_LEAD = "أعد كتابة هذا السؤال كاملًا بسؤال بديل يقيس الفكرة نفسها، بالنوع نفسه والعلامة نفسها، وعالج هذه الملاحظات:";
export function regenerateInstruction(messages: readonly string[]): string {
  let out = REGENERATE_LEAD;
  for (const m of unique(messages.map(x => String(x).replace(/\s+/g, " ").trim()).filter(Boolean))) {
    const line = "\n- " + m;
    if (out.length + line.length > COMPOSER_LIMITS.instructionChars) break;
    out += line;
  }
  return out;
}
