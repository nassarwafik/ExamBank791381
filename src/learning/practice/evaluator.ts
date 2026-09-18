// Learning Materials — Phase 3A: QUESTION / EVALUATOR / FEEDBACK FOUNDATION (contract only).
//
// Future-safe separation, established BEFORE large-scale book conversion so Phase 4 needs no schema redesign:
//
//     Question presentation  ->  Evaluator  ->  Feedback state
//
// Phase 3A ships ONLY the contracts + a pure, injectable LOCAL evaluator + an evaluator registry. It ships NO
// server evaluator, NO network call, NO grading, NO student persistence, and it is NOT wired into the Phase-3 static
// practice rendering (which stays unchanged and never puts the answer key in the DOM). The same contract lets a
// later phase inject a local, a server, or NO evaluator without touching question presentation.

import { hintLadder, type PracticeQuestion, type PracticeQuestionKind, type PracticeFeedback } from "../content/types";

// ── Student response (presentation -> evaluator) ─────────────────────────────────────────────────────────────
/** What the presentation layer collects. Shape per question kind; unknown fields are ignored by evaluators. */
export type LearningResponse =
  | { kind: "multipleChoice"; optionId: string }
  | { kind: "trueFalse"; value: boolean }
  | { kind: "shortInput"; text: string }
  | { kind: "fillBlank"; texts: string[] };

// ── Evaluation result (evaluator -> feedback) ────────────────────────────────────────────────────────────────
export type EvaluationStatus = "correct" | "incorrect" | "partial" | "unknown";
export interface EvaluationResult {
  status: EvaluationStatus;
  /** Optional 0..1 completeness for partial results (fillBlank). Educational only — never a grade. */
  score?: number;
  /** Which feedback message applies (chosen by the evaluator, revealed by the feedback layer). */
  message?: string;
}

/**
 * The evaluator contract. PURE (same question + response -> same result) and INJECTABLE: the presentation layer
 * receives an evaluator, never constructs one. `kind` narrows what it can judge; `evaluate` returns "unknown" when
 * a question carries no answer key (the key may live elsewhere later, e.g. behind a server evaluator).
 */
export interface LearningQuestionEvaluator {
  readonly id: string;
  readonly kinds: readonly PracticeQuestionKind[];
  evaluate(question: PracticeQuestion, response: LearningResponse): EvaluationResult;
}

// ── Feedback state (the hint ladder + reveal progression, kept in React state only) ─────────────────────────
/**
 * The feedback layer's state contract: submission + the ordered reveal ladder
 *   تلميح 1 -> تلميح 2 -> ... -> اعرض أول خطوة -> اعرض الحل
 * `revealedHints` counts ladder rungs revealed so far; the solution reveal is a separate, later step. Nothing here
 * is persisted (no attempts, no progress); it is the in-memory model Phase 4 renders.
 */
export interface LearningFeedbackState {
  submitted: boolean;
  result?: EvaluationResult;
  revealedHints: number;
  solutionRevealed: boolean;
}
export const INITIAL_FEEDBACK_STATE: LearningFeedbackState = { submitted: false, revealedHints: 0, solutionRevealed: false };

/** The hints revealed so far, in ladder order (pure). Never called by Phase-3 static rendering. */
export function revealedHints(feedback: PracticeFeedback | undefined, state: LearningFeedbackState): string[] {
  return hintLadder(feedback).slice(0, Math.max(0, state.revealedHints));
}
/** Reveal the next rung of the ladder (pure state transition, capped at the ladder length). */
export function revealNextHint(feedback: PracticeFeedback | undefined, state: LearningFeedbackState): LearningFeedbackState {
  const max = hintLadder(feedback).length;
  return { ...state, revealedHints: Math.min(state.revealedHints + 1, max) };
}

// ── Evaluator registry (injectable; production ships NONE wired into rendering) ───────────────────────────────
export interface LearningEvaluatorRegistry {
  /** The evaluator for a question kind, or undefined ("no evaluator" — presentation stays static). */
  resolve(kind: PracticeQuestionKind): LearningQuestionEvaluator | undefined;
  readonly size: number;
}
export function createEvaluatorRegistry(evaluators: readonly LearningQuestionEvaluator[]): LearningEvaluatorRegistry {
  const byKind = new Map<PracticeQuestionKind, LearningQuestionEvaluator>();
  for (const ev of evaluators) for (const k of ev.kinds) if (!byKind.has(k)) byKind.set(k, ev);
  return { resolve: kind => byKind.get(kind), get size() { return evaluators.length; } };
}

// ── The pure LOCAL evaluator (reference implementation; not wired into Phase-3 rendering) ────────────────────
const norm = (s: string) => s.trim().toLocaleLowerCase("ar").replace(/\s+/g, " ");

/** Judges against the answer key carried on the question. Pure; no I/O. Returns "unknown" when no key exists. */
export const localEvaluator: LearningQuestionEvaluator = {
  id: "local",
  kinds: ["multipleChoice", "trueFalse", "shortInput", "fillBlank"],
  evaluate(question, response) {
    if (question.kind !== response.kind) return { status: "unknown" };
    const fb = question.feedback;
    const verdict = (ok: boolean): EvaluationResult => ({ status: ok ? "correct" : "incorrect", message: ok ? fb?.correctFeedback : fb?.incorrectFeedback });
    switch (question.kind) {
      case "multipleChoice": {
        if (!question.options.some(o => o.correct !== undefined)) return { status: "unknown" };
        return verdict(question.options.some(o => o.id === (response as { optionId: string }).optionId && o.correct === true));
      }
      case "trueFalse":
        if (question.answer === undefined) return { status: "unknown" };
        return verdict(question.answer === (response as { value: boolean }).value);
      case "shortInput":
        if (question.answer === undefined) return { status: "unknown" };
        return verdict(norm(question.answer) === norm((response as { text: string }).text));
      case "fillBlank": {
        const keys = question.answers;
        if (!keys || keys.length === 0) return { status: "unknown" };
        const given = (response as { texts: string[] }).texts;
        const hits = keys.filter((k, i) => norm(k) === norm(given[i] ?? "")).length;
        if (hits === keys.length) return verdict(true);
        if (hits === 0) return verdict(false);
        return { status: "partial", score: hits / keys.length, message: fb?.incorrectFeedback };
      }
    }
  },
};

/** The "no evaluator" registry — the Phase-3 production posture: questions are presented statically, never judged. */
export const noEvaluatorRegistry: LearningEvaluatorRegistry = createEvaluatorRegistry([]);
