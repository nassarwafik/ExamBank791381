// Phase 21F.1 — render isolation for the builder's inline issues. The finalization decision is recomputed on every edit, so its
// issue arrays are new objects each time even for the 99 questions that did not change; handing those to memoized cards would
// re-render every card on every keystroke. `stabilizeIssues` keeps the PREVIOUS array of a question / section whenever its issues
// read the same (code, severity, message, target), so an unchanged card receives the same reference and React skips it. Only the
// arrays given to the cards are stabilized: every decision (summary routing, focus, finalization) still reads the live index.
import type { StructuredIssue } from "../examQuality";
import type { IssueIndex } from "./issueIndex";

export type StableIssues = {
  bySection: ReadonlyMap<string, readonly StructuredIssue[]>;
  byQuestion: ReadonlyMap<string, readonly StructuredIssue[]>;
  /** Per section: the issues of ITS questions (a section editor re-renders only when one of its own cards' issues changed). */
  questionsOfSection: ReadonlyMap<string, ReadonlyMap<string, readonly StructuredIssue[]>>;
};

const sameIssue = (a: StructuredIssue, b: StructuredIssue) =>
  a.code === b.code && a.severity === b.severity && a.message === b.message && a.questionId === b.questionId && a.sectionId === b.sectionId;
const sameList = (a: readonly StructuredIssue[], b: readonly StructuredIssue[]) => a === b || (a.length === b.length && a.every((x, i) => sameIssue(x, b[i])));

function stableMap(prev: ReadonlyMap<string, readonly StructuredIssue[]> | undefined, next: ReadonlyMap<string, readonly StructuredIssue[]>) {
  const out = new Map<string, readonly StructuredIssue[]>();
  for (const [key, list] of next) {
    const old = prev?.get(key);
    out.set(key, old && sameList(old, list) ? old : list);
  }
  return out;
}
const sameEntries = (a: ReadonlyMap<string, readonly StructuredIssue[]> | undefined, b: ReadonlyMap<string, readonly StructuredIssue[]>) => {
  if (!a || a.size !== b.size) return false;
  for (const [k, v] of b) if (a.get(k) !== v) return false;
  return true;
};

export function stabilizeIssues(prev: StableIssues | null, index: IssueIndex, sections: readonly { id: string; questions?: readonly { examQuestionId: string }[] }[]): StableIssues {
  const byQuestion = stableMap(prev?.byQuestion, index.byQuestion);
  const bySection = stableMap(prev?.bySection, index.bySection);
  const questionsOfSection = new Map<string, ReadonlyMap<string, readonly StructuredIssue[]>>();
  for (const s of sections) {
    const own = new Map<string, readonly StructuredIssue[]>();
    for (const q of s.questions || []) { const list = byQuestion.get(q.examQuestionId); if (list) own.set(q.examQuestionId, list); }
    const old = prev?.questionsOfSection.get(s.id);
    questionsOfSection.set(s.id, old && sameEntries(old, own) ? old : own);
  }
  return { byQuestion, bySection, questionsOfSection };
}
