import type { BuilderQuestion, BuilderSection, StructuredExam } from "./examTypes";
import { deleteQuestion, deleteSection } from "./examBuilderState";
import { usedBankQuestionIds } from "./structuredExamProductivity";

/**
 * Phase 21E.1 (slice 2) — safe «تراجع» for deleting ONE question or ONE section in the structured builder.
 *
 * Why not "pop the history stack": the builder cannot tell atomically that the deletion is still the newest history entry (any later
 * keystroke is newer; after a save the present object is replaced; history keeps 100 entries). Undoing blindly would undo the wrong
 * edit. Instead the deletion is captured as an IMMUTABLE SNAPSHOT (the very same question / section object, unchanged) together with
 * where it was, and «تراجع» puts that snapshot back as ONE new history entry — re-validated against the exam as it is now:
 *   - nothing happens when the item is already back (Ctrl+Z / the toolbar undo restored it) or the exam is another exam;
 *   - a question whose section no longer exists, or whose bank question was inserted again meanwhile, is refused with a reason;
 *   - otherwise it returns after its previous neighbour, else before its next one, else at its original index (clamped), taking
 *     the first of those places that splits no scenario block (the end of the section always qualifies);
 *   - a scenario member re-joins its scenario at its original place when that keeps the members contiguous, otherwise it returns
 *     unlinked (never an invalid scenario).
 * Pure and loaded only with the builder (never in the initial graph).
 */
export type QuestionDeletion = {
  kind: "question";
  examId: string;
  sectionId: string;
  sectionTitle: string;
  question: BuilderQuestion;
  /** 0-based position in the section's question list at deletion time. */
  index: number;
  /** The number the teacher saw on the card (display number, else position + 1). */
  label: string;
  prevId: string | null;
  nextId: string | null;
  scenarioId: string | null;
  scenarioPos: number;
};
export type SectionDeletion = {
  kind: "section";
  examId: string;
  section: BuilderSection;
  index: number;
  label: string;
  prevId: string | null;
  nextId: string | null;
};
export type Deletion = QuestionDeletion | SectionDeletion;
export type RestoreOutcome = "restored" | "already-present" | "stale" | "section-missing" | "bank-duplicate" | "id-conflict";

const questionsOf = (s: BuilderSection | undefined) => (s && Array.isArray(s.questions) ? s.questions : []);
const allQuestionIds = (exam: StructuredExam) => new Set((exam.sections || []).flatMap(s => questionsOf(s).map(q => q.examQuestionId)));
const bankIdOf = (q: BuilderQuestion) => { const id = (q as BuilderQuestion & { bankQuestionId?: unknown }).bankQuestionId; return typeof id === "string" && id ? id : ""; };

export function captureQuestionDeletion(exam: StructuredExam, sectionId: string, questionId: string): QuestionDeletion | null {
  const section = (exam.sections || []).find(s => s.id === sectionId);
  const list = questionsOf(section);
  const index = list.findIndex(q => q.examQuestionId === questionId);
  if (!section || index < 0) return null;
  const question = list[index];
  const scenario = (Array.isArray(section.scenarios) ? section.scenarios : []).find(sc => sc && Array.isArray(sc.questionIds) && sc.questionIds.includes(questionId));
  return {
    kind: "question", examId: exam.examId, sectionId, sectionTitle: section.title || "",
    question, index, label: question.displayNumber?.trim() ? question.displayNumber.trim() : String(index + 1),
    prevId: index > 0 ? list[index - 1].examQuestionId : null,
    nextId: index < list.length - 1 ? list[index + 1].examQuestionId : null,
    scenarioId: scenario ? scenario.id : null,
    scenarioPos: scenario ? scenario.questionIds.indexOf(questionId) : -1,
  };
}

export function captureSectionDeletion(exam: StructuredExam, sectionId: string): SectionDeletion | null {
  const sections = exam.sections || [];
  const index = sections.findIndex(s => s.id === sectionId);
  if (index < 0) return null;
  return {
    kind: "section", examId: exam.examId, section: sections[index], index, label: String(index + 1),
    prevId: index > 0 ? sections[index - 1].id : null,
    nextId: index < sections.length - 1 ? sections[index + 1].id : null,
  };
}

/** The deletion itself — exactly the existing transitions (same scenario clean-up as before). */
export function applyDeletion(exam: StructuredExam, d: Deletion): StructuredExam {
  const sections = exam.sections || [];
  return { ...exam, sections: d.kind === "question" ? deleteQuestion(sections, d.sectionId, d.question.examQuestionId) : deleteSection(sections, d.section.id) };
}

function insertAt<T>(list: readonly T[], item: T, at: number): T[] {
  const i = Math.max(0, Math.min(at, list.length));
  return [...list.slice(0, i), item, ...list.slice(i)];
}
/** Where the item may return, in order of preference: after its previous neighbour, before its next one, its original index
 *  (clamped), and finally the end of the list. */
function candidatePositions<T>(list: readonly T[], idOf: (x: T) => string, prevId: string | null, nextId: string | null, index: number): number[] {
  const out: number[] = [];
  if (prevId) { const p = list.findIndex(x => idOf(x) === prevId); if (p >= 0) out.push(p + 1); }
  if (nextId) { const n = list.findIndex(x => idOf(x) === nextId); if (n >= 0) out.push(n); }
  out.push(Math.max(0, Math.min(index, list.length)), list.length);
  return out;
}
/** Members of a scenario must stay contiguous in the section (scenarioSource.validateSectionScenarios rule 5). */
function contiguous(questions: readonly BuilderQuestion[], memberIds: readonly string[]): boolean {
  const pos = memberIds.map(id => questions.findIndex(q => q.examQuestionId === id));
  if (pos.some(p => p < 0)) return false;
  pos.sort((a, b) => a - b);
  return pos.length === 0 || pos[pos.length - 1] - pos[0] + 1 === pos.length;
}

export function restoreDeletion(exam: StructuredExam, d: Deletion): { exam: StructuredExam; outcome: RestoreOutcome } {
  if (exam.examId !== d.examId) return { exam, outcome: "stale" };
  const sections = exam.sections || [];
  const present = allQuestionIds(exam);
  if (d.kind === "section") {
    if (sections.some(s => s.id === d.section.id)) return { exam, outcome: "already-present" };
    const ids = questionsOf(d.section).map(q => q.examQuestionId);
    if (ids.some(id => present.has(id))) return { exam, outcome: "id-conflict" };
    const used = usedBankQuestionIds(exam);
    if (questionsOf(d.section).some(q => { const b = bankIdOf(q); return !!b && used.has(b); })) return { exam, outcome: "bank-duplicate" };
    const at = candidatePositions(sections, s => s.id, d.prevId, d.nextId, d.index)[0];
    return { exam: { ...exam, sections: insertAt(sections, d.section, at) }, outcome: "restored" };
  }
  const qid = d.question.examQuestionId;
  if (present.has(qid)) return { exam, outcome: "already-present" };
  const section = sections.find(s => s.id === d.sectionId);
  if (!section) return { exam, outcome: "section-missing" };
  const bank = bankIdOf(d.question);
  if (bank && usedBankQuestionIds(exam).has(bank)) return { exam, outcome: "bank-duplicate" };
  const list = questionsOf(section);
  const before = Array.isArray(section.scenarios) ? section.scenarios : [];
  const attempt = (at: number) => {
    const questions = insertAt(list, d.question, at);
    let scenarios = section.scenarios;
    if (d.scenarioId && Array.isArray(section.scenarios)) {
      scenarios = section.scenarios.map(sc => {
        if (!sc || sc.id !== d.scenarioId || !Array.isArray(sc.questionIds)) return sc;
        const memberIds = insertAt(sc.questionIds, qid, d.scenarioPos < 0 ? sc.questionIds.length : d.scenarioPos);
        return contiguous(questions, memberIds) ? { ...sc, questionIds: memberIds } : sc;
      });
    }
    // The return must not split ANY scenario that is contiguous now (e.g. the previous neighbour was moved inside another block).
    const keepsBlocks = (Array.isArray(scenarios) ? scenarios : []).every((sc, i) => {
      const was = before[i];
      if (!sc || !Array.isArray(sc.questionIds) || !was || !Array.isArray(was.questionIds) || !contiguous(list, was.questionIds)) return true;
      return contiguous(questions, sc.questionIds);
    });
    return { questions, scenarios, keepsBlocks };
  };
  // The end of the section always keeps every block whole, so the last candidate always succeeds.
  const r = candidatePositions(list, q => q.examQuestionId, d.prevId, d.nextId, d.index).map(attempt).find(x => x.keepsBlocks) ?? attempt(list.length);
  const restored: BuilderSection = r.scenarios === section.scenarios ? { ...section, questions: r.questions } : { ...section, questions: r.questions, scenarios: r.scenarios };
  return { exam: { ...exam, sections: sections.map(s => (s.id === d.sectionId ? restored : s)) }, outcome: "restored" };
}

/** True when the deleted item is back in `exam` (restored by «تراجع», by Ctrl+Z, or by the toolbar undo). */
export function deletionIsBack(exam: StructuredExam, d: Deletion): boolean {
  if (exam.examId !== d.examId) return false;
  return d.kind === "section" ? (exam.sections || []).some(s => s.id === d.section.id) : allQuestionIds(exam).has(d.question.examQuestionId);
}
