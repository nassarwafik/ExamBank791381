// Phase 21F.5 — pure positional operations for the Studio's insert bar and drag-and-drop. They complete the canonical
// examBuilderState helpers (append, ±1 moves, move-to-section) with exact positions; every call is ONE functional updater (one
// history step). Scenario membership follows the canonical rules: a question moved to another section leaves its scenario
// (moveQuestionToSection); a move inside a section keeps it, and the canonical validation reports a scenario whose members are no
// longer contiguous like any other structural issue.
import type { BuilderQuestion, BuilderSection } from "../examTypes";
import { moveQuestionToSection } from "../examBuilderState";

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(n) ? Math.trunc(n) : hi));

/** Insert `question` into section `sectionId` before the item at `index` (0 = first; ≥ length = last). Unknown section: unchanged. */
export function insertQuestionAt(sections: BuilderSection[], sectionId: string, index: number, question: BuilderQuestion): BuilderSection[] {
  if (!sections.some(s => s.id === sectionId)) return sections;
  return sections.map(s => {
    if (s.id !== sectionId) return s;
    const at = clamp(index, 0, s.questions.length);
    return { ...s, questions: [...s.questions.slice(0, at), question, ...s.questions.slice(at)] };
  });
}

/**
 * Move question `questionId` of section `fromSectionId` so that it lands before the item that is at `toIndex` of section
 * `toSectionId` NOW (the drop position a teacher points at; ≥ length = last). A no-op move returns the same array.
 */
export function placeQuestion(sections: BuilderSection[], fromSectionId: string, questionId: string, toSectionId: string, toIndex: number): BuilderSection[] {
  const from = sections.find(s => s.id === fromSectionId);
  const fromIndex = from ? from.questions.findIndex(q => q.examQuestionId === questionId) : -1;
  if (!from || fromIndex < 0 || !sections.some(s => s.id === toSectionId)) return sections;
  if (fromSectionId === toSectionId) {
    const target = clamp(toIndex, 0, from.questions.length);
    const at = target > fromIndex ? target - 1 : target;
    if (at === fromIndex) return sections;
    const rest = from.questions.filter((_, i) => i !== fromIndex);
    const questions = [...rest.slice(0, at), from.questions[fromIndex], ...rest.slice(at)];
    return sections.map(s => (s.id === fromSectionId ? { ...s, questions } : s));
  }
  const toLength = sections.find(s => s.id === toSectionId)!.questions.length;
  const moved = moveQuestionToSection(sections, fromSectionId, questionId, toSectionId);      // appended at the end of the target
  const at = clamp(toIndex, 0, toLength);
  if (at === toLength) return moved;
  return moved.map(s => {
    if (s.id !== toSectionId) return s;
    const q = s.questions[s.questions.length - 1];
    const rest = s.questions.slice(0, -1);
    return { ...s, questions: [...rest.slice(0, at), q, ...rest.slice(at)] };
  });
}
