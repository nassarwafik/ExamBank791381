import { describe, it, expect } from "vitest";
import { bitsFromValue, buildTask, canonicalAnswerForTask } from "../src/lib/number-conversion.js";
import { normalizeGameDoc, publicActive, startAttempt, applyAnswer, computeResult, mergeBest, streaksOf, INVALID_ANSWER_FORMAT, INVALID_ANSWER_MESSAGE } from "../src/lib/number-conversion-store.js";

// The per-student game document: start → answer (hint/reveal policy) → result + non-additive best record.
const T0 = "2026-01-01T00:00:00.000Z";
const later = ms => new Date(Date.parse(T0) + ms).toISOString();
const taskAt = (doc, index) => doc.active.tasks[index];
const correctBitsFor = (doc, index) => bitsFromValue(taskAt(doc, index).value);
/** The canonical TEXT answer for a task (what a student would type). */
const rightAnswer = (doc, index) => canonicalAnswerForTask(taskAt(doc, index));
/** A well-formed but WRONG text answer in the task's own target base. */
const wrongAnswer = (doc, index) => { const t = taskAt(doc, index); return canonicalAnswerForTask(buildTask("x", t.direction, (t.value + 1) % 256)); };
/** A malformed answer for the task's target base. */
const malformed = (doc, index) => ({ 2: "102010", 10: "4x", 16: "G7" })[taskAt(doc, index).targetBase];
const EMPTY = [0, 0, 0, 0, 0, 0, 0, 0];

function fresh(count = 3) {
  return startAttempt(null, { path: "mixed", level: "guided", seed: "seed-A", attemptId: "att-1", count, now: T0 });
}

describe("startAttempt + publicActive", () => {
  it("snapshots a round and exposes a client-safe view with no value/solution", () => {
    const doc = fresh(3);
    expect(doc.active.tasks.length).toBe(3);
    expect(doc.active.index).toBe(0);
    expect(doc.active.outcomes).toEqual([]);
    const pub = publicActive(doc.active);
    expect(pub).toMatchObject({ total: 3, index: 0, taskNumber: 1, correct: 0, streak: 0, done: false, level: "guided", path: "mixed" });
    expect(pub.currentTask).toMatchObject({ taskId: "t1", bitWidth: 8 });
    expect(pub.currentTask).not.toHaveProperty("value");
    expect(JSON.stringify(pub)).not.toContain("\"value\"");
  });
});

describe("applyAnswer — the TEXT answer is graded; hint, reveal, advance", () => {
  it("a correct typed answer resolves the task with canonical answer, solution bits and explanation", () => {
    const doc = fresh(3);
    const r = applyAnswer(doc, { taskId: "t1", bits: EMPTY, answer: rightAnswer(doc, 0), now: T0 });
    expect(r.response).toMatchObject({ ok: true, correct: true, attempts: 1, done: false });
    expect(r.response.canonicalAnswer).toBe(rightAnswer(doc, 0));
    expect(r.response.solutionBits).toEqual(correctBitsFor(doc, 0));
    expect(typeof r.response.explanation).toBe("string");
    expect(r.doc.active.index).toBe(1);
    expect(r.doc.active.outcomes).toEqual([{ taskId: "t1", status: "correct", attempts: 1 }]);
    expect(r.response.state.streak).toBe(1);
  });
  it("the text answer is the authority: correct text + WRONG boxes still succeeds; right boxes + wrong text fails", () => {
    const doc = fresh(3);
    const ok = applyAnswer(doc, { taskId: "t1", bits: bitsFromValue((taskAt(doc, 0).value + 7) % 256), answer: rightAnswer(doc, 0), now: T0 });
    expect(ok.response.correct).toBe(true);
    const doc2 = fresh(3);
    const bad = applyAnswer(doc2, { taskId: "t1", bits: correctBitsFor(doc2, 0), answer: wrongAnswer(doc2, 0), now: T0 });
    expect(bad.response).toMatchObject({ ok: true, correct: false, attempts: 1 });
  });
  it("a MALFORMED answer is a format error: nothing changes (attempts, index, outcomes, streak, reveal)", () => {
    const doc = fresh(3);
    const r = applyAnswer(doc, { taskId: "t1", bits: EMPTY, answer: malformed(doc, 0), now: T0 });
    expect(r.changed).toBe(false);
    expect(r.response).toMatchObject({ ok: false, error: INVALID_ANSWER_FORMAT, message: INVALID_ANSWER_MESSAGE });
    expect(r.response).not.toHaveProperty("solutionBits");
    expect(r.response).not.toHaveProperty("canonicalAnswer");
    expect(r.doc.active.currentAttempts).toBe(0);
    expect(r.doc.active.index).toBe(0);
    expect(r.doc.active.outcomes).toEqual([]);
    // after one real wrong attempt, a format error still does not consume the second attempt
    const w1 = applyAnswer(doc, { taskId: "t1", bits: EMPTY, answer: wrongAnswer(doc, 0), now: T0 });
    expect(w1.doc.active.currentAttempts).toBe(1);
    const f2 = applyAnswer(w1.doc, { taskId: "t1", bits: EMPTY, answer: malformed(doc, 0), now: T0 });
    expect(f2.changed).toBe(false);
    expect(f2.doc.active.currentAttempts).toBe(1);
    expect(f2.doc.active.index).toBe(0);
  });
  it("first wrong → a hint and stays on the task (no reveal); second wrong → canonical answer + bits revealed, counted incorrect", () => {
    const doc = fresh(3);
    const r1 = applyAnswer(doc, { taskId: "t1", bits: EMPTY, answer: wrongAnswer(doc, 0), now: T0 });
    expect(r1.response).toMatchObject({ ok: true, correct: false, attempts: 1 });
    expect(r1.response.hint).toBeTruthy();
    expect(r1.response.hint).not.toContain(rightAnswer(doc, 0));
    expect(r1.response).not.toHaveProperty("solutionBits");                     // no reveal on the first miss
    expect(r1.response).not.toHaveProperty("canonicalAnswer");
    expect(r1.doc.active.index).toBe(0);                                        // still on the same task
    const r2 = applyAnswer(r1.doc, { taskId: "t1", bits: EMPTY, answer: wrongAnswer(doc, 0), now: T0 });
    expect(r2.response).toMatchObject({ ok: true, correct: false, revealed: true, attempts: 2 });
    expect(r2.response.solutionBits).toEqual(correctBitsFor(doc, 0));            // revealed only now
    expect(r2.response.canonicalAnswer).toBe(rightAnswer(doc, 0));
    expect(r2.doc.active.index).toBe(1);
    expect(r2.doc.active.outcomes[0]).toEqual({ taskId: "t1", status: "revealed", attempts: 2 });
  });
  it("a completed / mismatched task cannot be re-answered (anti-farming, refresh-safe)", () => {
    const doc = fresh(3);
    const r = applyAnswer(doc, { taskId: "t1", bits: EMPTY, answer: rightAnswer(doc, 0), now: T0 });   // now on t2
    const stale = applyAnswer(r.doc, { taskId: "t1", bits: EMPTY, answer: rightAnswer(doc, 0), now: T0 });
    expect(stale.response).toMatchObject({ ok: false, error: "stale-task", expectedTaskId: "t2" });
    expect(stale.changed).toBe(false);
    expect(stale.doc.active.index).toBe(1);                                     // unchanged
  });
});

describe("completion → server result + best record", () => {
  it("finishing computes correct/total/percentage/bestStreak/elapsed, merges best, clears active", () => {
    let doc = fresh(3);
    // t1 correct, t2 revealed (2 wrong), t3 correct → 2/3 = 67%, best streak 1
    let r = applyAnswer(doc, { taskId: "t1", bits: EMPTY, answer: rightAnswer(doc, 0), now: T0 }); doc = r.doc;
    r = applyAnswer(doc, { taskId: "t2", bits: EMPTY, answer: wrongAnswer(doc, 1), now: later(1000) }); doc = r.doc;
    r = applyAnswer(doc, { taskId: "t2", bits: EMPTY, answer: wrongAnswer(doc, 1), now: later(2000) }); doc = r.doc;
    r = applyAnswer(doc, { taskId: "t3", bits: EMPTY, answer: rightAnswer(doc, 2), now: later(5000) }); doc = r.doc;
    expect(r.response.done).toBe(true);
    expect(r.response.result).toMatchObject({ correct: 2, total: 3, percentage: 67, bestStreak: 1, elapsedMs: 5000 });
    expect(r.response.best).toMatchObject({ correct: 2, total: 3, percentage: 67 });
    expect(doc.active).toBeNull();                                              // active cleared on completion
  });
  it("best record is a non-additive merge (better percentage/correct/time wins; ties keep prior)", () => {
    const a = { percentage: 80, correct: 8, total: 10, bestStreak: 5, elapsedMs: 60000, at: T0 };
    const worse = { percentage: 60, correct: 6, total: 10, bestStreak: 3, elapsedMs: 30000, at: later(1) };
    const better = { percentage: 90, correct: 9, total: 10, bestStreak: 6, elapsedMs: 90000, at: later(2) };
    const fasterSame = { percentage: 80, correct: 8, total: 10, bestStreak: 5, elapsedMs: 40000, at: later(3) };
    expect(mergeBest(null, a)).toEqual(a);
    expect(mergeBest(a, worse)).toBe(a);                                        // worse ignored (not additive)
    expect(mergeBest(a, better)).toEqual(better);
    expect(mergeBest(a, fasterSame)).toEqual(fasterSame);                       // tie on %/correct → faster wins
    expect(mergeBest(a, a)).toEqual(a);                                          // idempotent
  });
  it("streaksOf finds the current (trailing) and best runs", () => {
    const o = s => s.split("").map(c => ({ status: c === "c" ? "correct" : "revealed" }));
    expect(streaksOf(o("ccrcc"))).toEqual({ current: 2, best: 2 });
    expect(streaksOf(o("ccccc"))).toEqual({ current: 5, best: 5 });
    expect(streaksOf(o("crc"))).toEqual({ current: 1, best: 1 });
    expect(streaksOf(o("rrr"))).toEqual({ current: 0, best: 0 });
  });
});

describe("normalizeGameDoc — safe against malformed / forged docs", () => {
  it("drops junk and never trusts stored derived fields", () => {
    expect(normalizeGameDoc(null)).toEqual({ schemaVersion: 1, active: null, best: null });
    expect(normalizeGameDoc({ active: { tasks: [] } }).active).toBeNull();
    expect(normalizeGameDoc({ best: { percentage: "99", correct: -5 } }).best).toMatchObject({ percentage: 99, correct: 0 });
  });
});
