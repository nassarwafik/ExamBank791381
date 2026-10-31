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
//   • `practice` wordBank / matching / ordering / classify with their key   → key: answers / pairs / order / assign
//   • `simulation` / `network-lab` v1 (791381s Phase 8B) with a topology and checks → key: { topology, checks }; the SERVER
//     replays the learner's actions and every check must pass (api/src/lib/learning-lab.js). It may opt out with
//     `studyEligible: false` like any practice block (checked, never counted).
// NOT eligible (deferred or not auto-provable): `practice` fillBlank (no interactive answering surface in the Reader
// yet), the browser-engine CLI simulator exercises (`cli-terminal`) (their goal checking runs in the browser engine only — no server verification yet),
// diagrams / animations / guided activities, open or reflective prompts, and every reading block.
//
// IDENTITY: the activity id is the block's own id, which the content validator guarantees unique per course and
// which the authoring contract treats as stable (renaming a block id is a content change, never a cosmetic one).
import { isNetworkLabBlock, NETWORK_LAB_VERSION, type ContentBlock, type ContentPage, type PracticeQuestion, type PracticeTableBlock, type SimulationBlock } from "../content/types";

/** The normalization shared with the local evaluator (src/learning/practice/evaluator.ts) and the server. */
export const normalizeStudyText = (s: string): string => String(s ?? "").trim().toLocaleLowerCase("ar").replace(/\s+/g, " ");

export type StudyActivityKey =
  | { kind: "multipleChoice"; correct: string[] }
  | { kind: "trueFalse"; answer: boolean }
  | { kind: "shortInput"; answer: string }
  | { kind: "practice-table"; cells: Record<string, string> }
  | { kind: "wordBank"; answers: Record<string, string> }
  | { kind: "matching"; pairs: Record<string, string> }
  | { kind: "ordering"; order: string[] }
  | { kind: "classify"; assign: Record<string, string> }
  | { kind: "network-lab"; topology: Record<string, unknown>; checks: Record<string, unknown>[] };

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
    case "wordBank":
      return question.answers && Object.keys(question.answers).length > 0 ? { kind: "wordBank", answers: { ...question.answers } } : null;
    case "matching":
      return question.pairs && Object.keys(question.pairs).length > 0 ? { kind: "matching", pairs: { ...question.pairs } } : null;
    case "ordering":
      return question.order && question.order.length > 0 ? { kind: "ordering", order: [...question.order] } : null;
    case "classify":
      return question.assign && Object.keys(question.assign).length > 0 ? { kind: "classify", assign: { ...question.assign } } : null;
    default:
      return null;                                   // fillBlank: no interactive surface yet → never a study point
  }
}

/** The key of a `practice-table` (its select cells by "row:col"), or null when it has no select cell or a cell carries no
 *  key (a served body, L.6b: the server holds the key). Pure. */
export function practiceTableKey(block: PracticeTableBlock): StudyActivityKey | null {
  const cells: Record<string, string> = {};
  let keyless = false;
  block.rows.forEach((row, r) => row.forEach((cell, c) => {
    if (typeof cell === "string" || cell.kind !== "select") return;
    if (typeof cell.key === "string") cells[r + ":" + c] = cell.key; else keyless = true;
  }));
  return !keyless && Object.keys(cells).length > 0 ? { kind: "practice-table", cells } : null;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** The key of a network lab (v1, a topology object and at least one check), or null — e.g. a served body (the checks stayed on the
 *  server) or another version. Structural only: the simulator itself judges the topology and the checks (fail closed). Pure. */
export function networkLabKey(block: SimulationBlock): StudyActivityKey | null {
  if (!isNetworkLabBlock(block) || block.version !== NETWORK_LAB_VERSION || !isPlainObject(block.config)) return null;
  const { topology, checks } = block.config as { topology?: unknown; checks?: unknown };
  if (!isPlainObject(topology) || !Array.isArray(checks) || checks.length === 0 || !checks.every(isPlainObject)) return null;
  return { kind: "network-lab", topology, checks: checks as Record<string, unknown>[] };
}

/** The eligible activity of one block, or null. Pure.
 *  A practice-capable block may explicitly opt OUT with `studyEligible: false` (local self-check only): it stays
 *  interactive in the Reader but never earns a study point. This is generic — no page id is ever special-cased. */
export function studyActivityOf(block: ContentBlock): StudyActivitySpec | null {
  if (block.type === "practice") { if (block.studyEligible === false) return null; const key = practiceQuestionKey(block.question); return key ? { activityId: block.id, key } : null; }
  if (block.type === "practice-table") { if (block.studyEligible === false) return null; const key = practiceTableKey(block); return key ? { activityId: block.id, key } : null; }
  if (isNetworkLabBlock(block)) { if (block.studyEligible === false) return null; const key = networkLabKey(block); return key ? { activityId: block.id, key } : null; }
  return null;
}

/** Every eligible activity of a page, in authored order. Pure. */
export function eligibleStudyActivities(page: Pick<ContentPage, "blocks">): StudyActivitySpec[] {
  const out: StudyActivitySpec[] = [];
  for (const block of page.blocks) { const spec = studyActivityOf(block); if (spec) out.push(spec); }
  return out;
}

/**
 * The study activity ids of a page, for an AUTHORED body (judged by its key) and for a SERVED one alike (L.6b: the key stayed on
 * the server and the block carries `serverCheck`). The two always name the same set: the served body keeps `serverCheck` exactly
 * on the blocks that had a key, and the opt-out flag travels unchanged. Pure.
 */
export function studyActivityIds(page: Pick<ContentPage, "blocks">): string[] {
  const out: string[] = [];
  for (const block of page.blocks) {
    if (block.type !== "practice" && block.type !== "practice-table" && !isNetworkLabBlock(block)) continue;
    if (block.serverCheck === true ? block.studyEligible !== false : studyActivityOf(block) !== null) out.push(block.id);
  }
  return out;
}
