// Phase 21S — the composer's warnings, grouped for the teacher's review. A warning that names a question (a 21Q quality check, a duplicate
// stem, an image request …) is listed under THAT question, in exam order, with its running number, the start of its stem and the exam
// that previews it alone; a warning without a question (plan / coverage / diversity) stays at exam level. Identical messages under the same
// question are shown once. A question id the exam does not hold (a stale or forged id) is never invented: its warning stays at exam level.
// Pure (no React): the dialog renders the result.
import type { BuilderQuestion, BuilderSection, StructuredExam } from "../examTypes";

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
