// Phase 3A — question / evaluator / feedback FOUNDATION. Pure contracts; no DOM, no network, no persistence.
import { describe, it, expect, vi } from "vitest";
import {
  localEvaluator, createEvaluatorRegistry, noEvaluatorRegistry, revealedHints, revealNextHint, INITIAL_FEEDBACK_STATE,
  type LearningQuestionEvaluator, type EvaluationResult,
} from "./evaluator";
import { hintLadder, type PracticeQuestion, type PracticeFeedback } from "../content/types";

const feedback: PracticeFeedback = {
  hints: ["تلميح 1", "تلميح 2"], correctFeedback: "أحسنت", incorrectFeedback: "حاول مرة أخرى", explanation: "شرح",
};
const mcq: PracticeQuestion = { kind: "multipleChoice", prompt: "؟", options: [{ id: "a", text: "A", correct: true }, { id: "b", text: "B" }], feedback };
const tf: PracticeQuestion = { kind: "trueFalse", prompt: "؟", answer: true, feedback };
const short: PracticeQuestion = { kind: "shortInput", prompt: "؟", answer: "  Access ", feedback };
const fill: PracticeQuestion = { kind: "fillBlank", prompt: "؟", answers: ["32", "8"], feedback };

describe("Phase 3A — local evaluator is PURE and judges every base kind", () => {
  it("multipleChoice / trueFalse / shortInput (normalized) / fillBlank (partial)", () => {
    expect(localEvaluator.evaluate(mcq, { kind: "multipleChoice", optionId: "a" })).toEqual({ status: "correct", message: "أحسنت" });
    expect(localEvaluator.evaluate(mcq, { kind: "multipleChoice", optionId: "b" }).status).toBe("incorrect");
    expect(localEvaluator.evaluate(tf, { kind: "trueFalse", value: true }).status).toBe("correct");
    expect(localEvaluator.evaluate(short, { kind: "shortInput", text: "access" }).status).toBe("correct");
    expect(localEvaluator.evaluate(fill, { kind: "fillBlank", texts: ["32", "8"] }).status).toBe("correct");
    const partial = localEvaluator.evaluate(fill, { kind: "fillBlank", texts: ["32", "x"] });
    expect(partial.status).toBe("partial");
    expect(partial.score).toBe(0.5);
  });
  it("returns 'unknown' when the question carries no answer key, and for a kind mismatch", () => {
    const keyless: PracticeQuestion = { kind: "trueFalse", prompt: "؟" };
    expect(localEvaluator.evaluate(keyless, { kind: "trueFalse", value: true }).status).toBe("unknown");
    expect(localEvaluator.evaluate(mcq, { kind: "trueFalse", value: true }).status).toBe("unknown");
  });
  it("is deterministic and does not mutate its inputs", () => {
    const snap = JSON.stringify(mcq);
    const a = localEvaluator.evaluate(mcq, { kind: "multipleChoice", optionId: "a" });
    const b = localEvaluator.evaluate(mcq, { kind: "multipleChoice", optionId: "a" });
    expect(a).toEqual(b);
    expect(JSON.stringify(mcq)).toBe(snap);
  });
});

describe("Phase 3A — evaluator is INJECTABLE (local / server / none share one contract)", () => {
  it("a registry resolves by question kind; a custom (future server) evaluator plugs in without touching presentation", () => {
    const fakeServer: LearningQuestionEvaluator = {
      id: "server-stub", kinds: ["shortInput"],
      evaluate: vi.fn((): EvaluationResult => ({ status: "correct" })),
    };
    const reg = createEvaluatorRegistry([fakeServer, localEvaluator]);
    expect(reg.size).toBe(2);
    expect(reg.resolve("shortInput")?.id).toBe("server-stub");   // first registration wins for its kinds
    expect(reg.resolve("multipleChoice")?.id).toBe("local");
  });
  it("the 'no evaluator' registry (Phase-3 production posture) resolves nothing — questions stay static", () => {
    expect(noEvaluatorRegistry.size).toBe(0);
    expect(noEvaluatorRegistry.resolve("multipleChoice")).toBeUndefined();
  });
  it("has no backend dependency: the module never references fetch / XMLHttpRequest / storage", async () => {
    const src = await import("fs").then(fs => fs.readFileSync(new URL("./evaluator.ts", import.meta.url), "utf8"));
    for (const banned of ["fetch(", "XMLHttpRequest", "localStorage", "sessionStorage", "indexedDB", "/api"]) {
      expect(src, banned).not.toContain(banned);
    }
  });
});

describe("Phase 3A — hint ladder (ordered, backward-compatible) + feedback state", () => {
  it("hintLadder returns ordered hints, folds the legacy single hint in, and is empty without feedback", () => {
    expect(hintLadder(feedback)).toEqual(["تلميح 1", "تلميح 2"]);
    expect(hintLadder({ hint: "قديم" })).toEqual(["قديم"]);
    expect(hintLadder({ hint: "قديم", hints: ["جديد 1"] })).toEqual(["جديد 1"]);   // ladder wins when present
    expect(hintLadder(undefined)).toEqual([]);
    expect(hintLadder({})).toEqual([]);
  });
  it("reveals rungs one at a time, capped at the ladder length; nothing is revealed initially", () => {
    let s = INITIAL_FEEDBACK_STATE;
    expect(revealedHints(feedback, s)).toEqual([]);
    s = revealNextHint(feedback, s);
    expect(revealedHints(feedback, s)).toEqual(["تلميح 1"]);
    s = revealNextHint(feedback, s);
    s = revealNextHint(feedback, s);                       // over-reveal is capped
    expect(s.revealedHints).toBe(2);
    expect(revealedHints(feedback, s)).toEqual(["تلميح 1", "تلميح 2"]);
    expect(s.submitted).toBe(false);
    expect(s.solutionRevealed).toBe(false);
  });
});
