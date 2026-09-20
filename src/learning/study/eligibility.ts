// Study Practice Strength — WHICH in-page exercises can earn a study point, and the answer key each one is judged
// against. This is the ONE eligibility rule, shared by the Reader (to show the page's study bar and to report an
// attempt) and by the server index generator (scripts/build-learning-study-index.mjs → api/src/data/learning-study/
// <courseId>.json), so the client and the server always agree on the set of eligible activity ids.
//
// Eligible (the platform can PROVE the answer automatically):
//   • `practice` multipleChoice with at least one `correct: true` option   → key: the correct option ids
//   • `practice` trueFalse with an `answer`                                 → key: the boolean
//   • `practice` shortInput with a non-empty `answer`                       → key: the normalized text
//   • `practice-table` (every select cell carries its expected choice)      → key: every select cell's choice
// NOT eligible (deferred or not auto-provable): `practice` fillBlank (no interactive answering surface in the Reader
// yet), CLI simulator exercises (their goal checking runs in the browser engine only — no server verification yet),
// diagrams / animations / guided activities, open or reflective prompts, and every reading block.
//
// IDENTITY: the activity id is the block's own id, which the content validator guarantees unique per course and
// which the authoring contract treats as stable (renaming a block id is a content change, never a cosmetic one).
import type { ContentBlock, ContentPage, PracticeQuestion, PracticeTableBlock } from "../content/types";

/** The normalization shared with the local evaluator (src/learning/practice/evaluator.ts) and the server. */
export const normalizeStudyText = (s: string): string => String(s ?? "").trim().toLocaleLowerCase("ar").replace(/\s+/g, " ");

export type StudyActivityKey =
  | { kind: "multipleChoice"; correct: string[] }
  | { kind: "trueFalse"; answer: boolean }
  | { kind: "shortInput"; answer: string }
  | { kind: "practice-table"; cells: Record<string, string> };

export interface StudyActivitySpec { activityId: string; key: StudyActivityKey; }

/** The key of one `practice` question when it is eligible, else null. Pure. */
export function practiceQuestionKey(question: PracticeQuestion): StudyActivityKey | null {
  switch (question.kind) {
    case "multipleChoice": {
      const correct = question.options.filter(o => o.correct === true).map(o => o.id);
      return correct.length > 0 ? { kind: "multipleChoice", correct } : null;
    }
    case "trueFalse":
      return typeof question.answer === "boolean" ? { kind: "trueFalse", answer: question.answer } : null;
    case "shortInput": {
      const answer = typeof question.answer === "string" ? normalizeStudyText(question.answer) : "";
      return answer ? { kind: "shortInput", answer } : null;
    }
    default:
      return null;                                   // fillBlank: no interactive surface yet → never a study point
  }
}

/** The key of a `practice-table` (its select cells by "row:col"), or null when it has no select cell. Pure. */
export function practiceTableKey(block: PracticeTableBlock): StudyActivityKey | null {
  const cells: Record<string, string> = {};
  block.rows.forEach((row, r) => row.forEach((cell, c) => { if (typeof cell !== "string" && cell.kind === "select") cells[r + ":" + c] = cell.key; }));
  return Object.keys(cells).length > 0 ? { kind: "practice-table", cells } : null;
}

/** The eligible activity of one block, or null. Pure. */
export function studyActivityOf(block: ContentBlock): StudyActivitySpec | null {
  if (block.type === "practice") { const key = practiceQuestionKey(block.question); return key ? { activityId: block.id, key } : null; }
  if (block.type === "practice-table") { const key = practiceTableKey(block); return key ? { activityId: block.id, key } : null; }
  return null;
}

/** Every eligible activity of a page, in authored order. Pure. */
export function eligibleStudyActivities(page: Pick<ContentPage, "blocks">): StudyActivitySpec[] {
  const out: StudyActivitySpec[] = [];
  for (const block of page.blocks) { const spec = studyActivityOf(block); if (spec) out.push(spec); }
  return out;
}
