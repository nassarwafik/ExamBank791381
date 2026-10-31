// Phase L.6b — the answer material leaves the browser. Two pure derivations of the authored content, both written by
// scripts/build-learning-content.mjs and pinned by src/learning/content/contentData.sync.test.ts:
//
//   • the SERVED module body (api/src/data/learning-content/<course>/<module>.json): the authored module with the answer material
//     of every `practice` and `practice-table` block removed — option `correct` flags, `answer` / `answers`, the whole `feedback`
//     (hints, right / wrong messages, explanation) and every select cell's `key`. A block that could be checked gets
//     `serverCheck: true` instead, so the Reader still knows to offer it;
//   • the CHECK INDEX (api/src/data/learning-check/<course>.json): per page, every checkable block's key, its feedback and whether
//     it is a study activity. The API judges every answer against it and returns the verdict with the matching feedback.
//
// Which blocks are checkable is the eligibility rule's key (practiceQuestionKey / practiceTableKey); `study` is the study rule
// itself (studyActivityOf), so the check index's study activities are exactly the study index's.
import { hintLadder, type ContentBlock, type ContentModule, type LearningCourseManifest, type PracticeQuestion } from "../content/types";
import { orderedModules } from "../content/navigation";
import { practiceQuestionKey, practiceTableKey, studyActivityOf, type StudyActivityKey } from "./eligibility";

/** What the server says after an answer: the right / wrong message, the hint ladder (after a wrong answer), the explanation (after a right one). */
export interface CheckFeedback { correct?: string; incorrect?: string; hints?: string[]; explanation?: string }
/** `reveal`: the block is in reveal mode (types.ts RevealMarker) — the server returns the right answer with every verdict. */
export interface CheckActivity { key: StudyActivityKey; study: boolean; feedback: CheckFeedback; reveal?: true }
export interface CheckIndexPage { moduleId: string; activities: Record<string, CheckActivity> }
export interface CheckIndex {
  schemaVersion: 1;
  courseId: string;
  /** Only pages that carry at least one checkable block, keyed by page id (content order). */
  pages: Record<string, CheckIndexPage>;
}

function feedbackOf(question: PracticeQuestion): CheckFeedback {
  const fb = question.feedback, out: CheckFeedback = {};
  if (fb?.correctFeedback) out.correct = fb.correctFeedback;
  if (fb?.incorrectFeedback) out.incorrect = fb.incorrectFeedback;
  const hints = hintLadder(fb);
  if (hints.length) out.hints = [...hints];
  if (fb?.explanation) out.explanation = fb.explanation;
  return out;
}

/** The check entry of one block, or null when the block cannot be checked automatically. Pure. */
export function checkActivityOf(block: ContentBlock): CheckActivity | null {
  if (block.type === "practice") {
    const key = practiceQuestionKey(block.question);
    return key ? { key, study: studyActivityOf(block) !== null, feedback: feedbackOf(block.question), ...(block.reveal === true ? { reveal: true as const } : {}) } : null;
  }
  if (block.type === "practice-table") {
    const key = practiceTableKey(block);
    return key ? { key, study: studyActivityOf(block) !== null, feedback: {} } : null;
  }
  return null;
}

/** The question as the browser receives it: the prompt and the option texts, nothing that tells or explains the answer. */
function servedQuestion(q: PracticeQuestion): PracticeQuestion {
  const items = (xs: { id: string; text: string }[]) => xs.map(x => ({ id: x.id, text: x.text }));
  switch (q.kind) {
    case "multipleChoice": return { kind: q.kind, prompt: q.prompt, options: q.options.map(o => ({ id: o.id, text: o.text })) };
    // Structured kinds keep their presentation only — never `answers` / `pairs` / `order` / `assign` (the key).
    case "wordBank": return { kind: q.kind, prompt: q.prompt, segments: q.segments.map(s => (typeof s === "string" ? s : { blank: s.blank })), bank: [...q.bank] };
    case "matching": return { kind: q.kind, prompt: q.prompt, left: items(q.left), right: items(q.right) };
    case "ordering": return { kind: q.kind, prompt: q.prompt, items: items(q.items) };
    case "classify": return { kind: q.kind, prompt: q.prompt, groups: items(q.groups), items: items(q.items) };
    case "trueFalse": case "shortInput": case "fillBlank": return { kind: q.kind, prompt: q.prompt };
  }
}

/** One block as the browser receives it. Pure; blocks other than `practice` / `practice-table` are returned unchanged. */
export function servedBlock(block: ContentBlock): ContentBlock {
  if (block.type === "practice") {
    const { question, serverCheck: _authored, ...rest } = block;
    return { ...rest, question: servedQuestion(question), ...(checkActivityOf(block) ? { serverCheck: true as const } : {}) };
  }
  if (block.type === "practice-table") {
    const { rows, serverCheck: _authored, ...rest } = block;
    const servedRows = rows.map(row => row.map(cell => (typeof cell === "string" ? cell : { kind: cell.kind, options: [...cell.options] })));
    return { ...rest, rows: servedRows, ...(checkActivityOf(block) ? { serverCheck: true as const } : {}) };
  }
  return block;
}

/** The module body the API serves: the authored module with every answer removed (see the header). Pure. */
export function servedModuleBody(module: ContentModule): ContentModule {
  return { ...module, lessons: module.lessons.map(lesson => ({ ...lesson, pages: lesson.pages.map(page => ({ ...page, blocks: page.blocks.map(servedBlock) })) })) };
}

export async function buildCheckIndex(courseId: string, manifest: LearningCourseManifest, loadModule: (courseId: string, moduleId: string) => Promise<ContentModule>): Promise<CheckIndex> {
  const pages: Record<string, CheckIndexPage> = {};
  for (const ref of orderedModules(manifest)) {
    const mod = await loadModule(courseId, ref.id);
    for (const lesson of [...mod.lessons].sort((a, b) => a.order - b.order)) {
      for (const page of [...lesson.pages].sort((a, b) => a.order - b.order)) {
        const activities: Record<string, CheckActivity> = {};
        for (const block of page.blocks) { const a = checkActivityOf(block); if (a) activities[block.id] = a; }
        if (Object.keys(activities).length) pages[page.id] = { moduleId: mod.id, activities };
      }
    }
  }
  return { schemaVersion: 1, courseId, pages };
}
