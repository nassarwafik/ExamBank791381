import type { Answer } from "../../StudentQuestionCard";
import { answered } from "../../StudentQuestionCard";
import type { QuestionPage } from "./questionPager";
import type { RecoveryVariant } from "./QuestionErrorBoundary";

/**
 * Phase 21E.3 — the running exam's record of questions whose renderer could not recover (assessment integrity).
 *
 * A question the student could not SEE is never presented — to the student or to the grader — as a question they chose not to
 * answer. The page keeps, per question, every recovery card that is currently failing (`live`) or was still failing when the
 * student moved on (`sticky`); a question is «unavailable» while any entry remains and it has no answer. The record is pure
 * presentation state: it never touches the answers map, and the server (the grading authority) verifies the report it
 * receives against the published exam and the stored answers before holding anything for the teacher.
 *
 * Events (reported by QuestionErrorBoundary through the recovery context):
 *  - failed      a material card caught an error (code = the sanitized classification only, never a message or URL);
 *  - recovered   that card's retry succeeded — its entry is removed;
 *  - unmounted   that card went away while still failing (the student moved on) — its entry becomes sticky;
 *  - shown       the question's page mounted clean again — the previous visit's sticky entries are removed. A card that failed in
 *                the same commit reports BEFORE the page mounts, so only sticky entries are cleared (never this visit's).
 */
export type RenderFailureCode = "chunk-load" | "runtime";
export type RenderFailureEvent =
  | { status: "failed"; questionId: string; boundaryId: string; variant: RecoveryVariant; code: RenderFailureCode }
  | { status: "recovered" | "unmounted"; questionId: string; boundaryId: string }
  | { status: "shown"; questionId: string };
export type RenderFailureEntry = Readonly<{ code: RenderFailureCode; variant: RecoveryVariant; live: boolean }>;
export type RenderFailureState = Readonly<Record<string, Readonly<Record<string, RenderFailureEntry>>>>;
/** One client report entry — what saveDraft / pauseAttempt / submit carry (additive). */
export type RenderFailureReport = { questionId: string; code: RenderFailureCode };

export const EMPTY_RENDER_FAILURES: RenderFailureState = Object.freeze({});
/** The cards whose failure means the question could not be fully displayed. An inline formula keeps its source text, a section
 *  header is decorative, and the exam / review shells are not questions. */
export const MATERIAL_VARIANTS: ReadonlySet<RecoveryVariant> = new Set<RecoveryVariant>(["question", "part", "page", "block", "stem"]);
export const UNAVAILABLE_LABEL = "تعذّر عرضه";

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** Pure reducer; returns the SAME object when the event changes nothing (so effects keyed on the state do not re-run). */
export function reduceRenderFailure(state: RenderFailureState, event: RenderFailureEvent): RenderFailureState {
  const q = state[event.questionId];
  switch (event.status) {
    case "failed": {
      const prev = q && own(q, event.boundaryId) ? q[event.boundaryId] : undefined;
      if (prev && prev.live && prev.code === event.code && prev.variant === event.variant) return state;
      return { ...state, [event.questionId]: { ...(q || {}), [event.boundaryId]: { code: event.code, variant: event.variant, live: true } } };
    }
    case "recovered": {
      if (!q || !own(q, event.boundaryId)) return state;
      const rest = { ...q };
      delete rest[event.boundaryId];
      return without(state, event.questionId, rest);
    }
    case "unmounted": {
      if (!q || !own(q, event.boundaryId) || !q[event.boundaryId].live) return state;
      return { ...state, [event.questionId]: { ...q, [event.boundaryId]: { ...q[event.boundaryId], live: false } } };
    }
    case "shown": {
      if (!q) return state;
      const rest: Record<string, RenderFailureEntry> = {};
      let changed = false;
      for (const id of Object.keys(q)) { if (q[id].live) rest[id] = q[id]; else changed = true; }
      return changed ? without(state, event.questionId, rest) : state;
    }
    default:
      return state;
  }
}
function without(state: RenderFailureState, questionId: string, rest: Record<string, RenderFailureEntry>): RenderFailureState {
  const next: Record<string, Readonly<Record<string, RenderFailureEntry>>> = { ...state };
  if (Object.keys(rest).length) next[questionId] = rest; else delete next[questionId];
  return next;
}

/** The questions with at least one failing (live or sticky) card. */
export function failedQuestionIds(state: RenderFailureState): ReadonlySet<string> {
  const out = new Set<string>();
  for (const id of Object.keys(state)) if (Object.keys(state[id]).length) out.add(id);
  return out;
}

/** The report the client sends: one entry per failed question, sorted, question id + code only. A chunk failure is reported
 *  ahead of a runtime error when both happened to one question (it names the more likely infrastructure cause). */
export function renderFailureReport(state: RenderFailureState): RenderFailureReport[] {
  const out: RenderFailureReport[] = [];
  for (const questionId of Object.keys(state).sort()) {
    const entries = Object.values(state[questionId]);
    if (!entries.length) continue;
    out.push({ questionId, code: entries.some(e => e.code === "chunk-load") ? "chunk-load" : "runtime" });
  }
  return out;
}

/** The pages the student could not display AND did not answer — what the review screen, the navigator and the submit warning count. */
export function unavailablePages(pages: readonly QuestionPage[], answers: Record<string, Answer>, failed: ReadonlySet<string>): QuestionPage[] {
  if (!failed.size) return [];
  return pages.filter(p => failed.has(p.id) && !answered(answers[p.id]));
}

/** The submit-confirmation warning (Arabic): how many questions, why, that it is not counted as a wrong answer, what to do. */
export function renderFailureSubmitWarning(count: number): string {
  const n = Math.max(0, Math.trunc(count));
  const what = n === 1 ? "تعذّر عرض سؤال واحد بسبب مشكلة تقنية في التحميل، ولم تُجب عنه."
    : n === 2 ? "تعذّر عرض سؤالين بسبب مشكلة تقنية في التحميل، ولم تُجب عنهما."
    : "تعذّر عرض " + n + " أسئلة بسبب مشكلة تقنية في التحميل، ولم تُجب عنها.";
  return "تنبيه: " + what + " عند التسليم لن يُحتسب ذلك كإجابة خاطئة، بل سيُحال إلى المعلم للمراجعة قبل اعتماد العلامة النهائية. " +
    "يمكنك العودة ومحاولة التحميل مجددًا، أو التسليم الآن.";
}
