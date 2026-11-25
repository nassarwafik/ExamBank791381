import { describe, it, expect } from "vitest";
import { evaluateMachineDesign, lengthFor, tmHalt, readRules, MACHINE_DESIGN_LIMITS } from "../src/lib/learning-machine-design.js";
import { readAutomatonConfig, runAutomaton } from "../src/lib/shared-finalization/learning/activities/automaton.js";

// AUTO-A10 (docs/enterprise-automata-lab-a4.md §14) — the SERVER judge of a push-down / Turing machine «صمّم الآلة» exercise. Owner
// decisions (2026-11-25): agreement on every word up to a length («not a proof»), or the SHORTEST word on which the machines certainly
// disagree; Turing machines recognise languages and compute functions (the answer between two $); a broken key → `unavailable`.

// The book's push-down automaton for aⁿbⁿ (unit 8), in the automaton-trace format.
const ANBN = { states: ["q0", "q1", "q2", "q3"], start: "q0", accept: ["q0", "q2"], transitions: [
  { from: "q0", read: "a", top: "⏊", op: "push", write: "S", to: "q1" }, { from: "q1", read: "a", top: "S", op: "push", write: "A", to: "q1" },
  { from: "q1", read: "a", top: "A", op: "push", write: "A", to: "q1" }, { from: "q1", read: "b", top: "S", op: "pop", write: "S", to: "q2" },
  { from: "q1", read: "b", top: "A", op: "pop", write: "A", to: "q3" }, { from: "q3", read: "b", top: "A", op: "pop", write: "A", to: "q3" },
  { from: "q3", read: "b", top: "S", op: "pop", write: "S", to: "q2" }] };
const PDA_RULES = { machine: "PDA", alphabet: ["a", "b"], maxStates: 6 };
const KEY = { kind: "machine-design", rules: PDA_RULES, reference: ANBN };
const judge = (machine, key = KEY) => evaluateMachineDesign(key, { kind: "machine-design", machine });
const rename = (m, map) => ({ states: m.states.map(q => map[q] ?? q), start: map[m.start] ?? m.start, accept: m.accept.map(q => map[q] ?? q), transitions: m.transitions.map(t => ({ ...t, from: map[t.from] ?? t.from, to: map[t.to] ?? t.to })) });

describe("AUTO-A10 — push-down automata: agreement up to a length, or the shortest separating word", () => {
  it("the reference agrees with itself on every word up to length 8 (511 words) — never «proved»", () => {
    expect(judge(ANBN)).toEqual({ status: "judged", correct: true, agreesUpTo: { length: 8, words: 511 } });
  });
  it("another machine for the same language (renamed states, an extra state) agrees", () => {
    const m = rename(ANBN, { q0: "s", q1: "u", q2: "f", q3: "v" });
    expect(judge({ ...m, states: [...m.states, "x"] })).toMatchObject({ correct: true });
  });
  it("a wrong machine: the shortest word (shortlex) on which they disagree, and whether the reference accepts it", () => {
    // forgets ε (q0 not accepting): ε first
    expect(judge({ ...ANBN, accept: ["q2"] })).toEqual({ status: "judged", correct: false, counterexample: { word: "", shouldAccept: true } });
    // accepts aⁿbᵐ for m ≤ n too (q3 accepting): «aab» is the first
    expect(judge({ ...ANBN, accept: ["q0", "q2", "q3"] })).toEqual({ status: "judged", correct: false, counterexample: { word: "aab", shouldAccept: false } });
  });
  it("public rules: a machine the course's reader refuses (two moves for one state / symbol / top) or too many states", () => {
    const two = { ...ANBN, transitions: [...ANBN.transitions, { from: "q0", read: "a", top: "⏊", op: "push", write: "A", to: "q0" }] };
    expect(judge(two)).toEqual({ status: "judged", correct: false, issue: { code: "malformed" } });
    expect(judge({ ...ANBN, states: ["q0", "q1", "q2", "q3", "q4", "q5", "q6"] })).toEqual({ status: "judged", correct: false, issue: { code: "too-many-states", max: 6 } });
    expect(judge({ ...ANBN, transitions: [{ ...ANBN.transitions[0], read: "c" }] })).toEqual({ status: "judged", correct: false, issue: { code: "malformed" } });   // outside the task's alphabet
  });
  it("only `machine` is read; the alphabet is the task's; a response of another kind is malformed", () => {
    expect(evaluateMachineDesign(KEY, { kind: "machine-design", machine: { ...ANBN, alphabet: ["a"] }, correct: true, verdict: "accept" })).toMatchObject({ correct: true });
    expect(evaluateMachineDesign(KEY, { kind: "automaton-design", machine: ANBN })).toEqual({ status: "judged", correct: false, issue: { code: "malformed" } });
    expect(evaluateMachineDesign(KEY, null)).toEqual({ status: "judged", correct: false, issue: { code: "malformed" } });
    expect(evaluateMachineDesign(KEY, { kind: "machine-design", machine: "q0" })).toEqual({ status: "judged", correct: false, issue: { code: "malformed" } });
  });
});

describe("AUTO-A10 — the length tried", () => {
  it("the task's maxLength (default 8), lowered until at most 2000 words", () => {
    expect(lengthFor(readRules({ machine: "PDA", alphabet: ["a", "b"] }))).toBe(8);            // 511
    expect(lengthFor(readRules({ machine: "PDA", alphabet: ["a", "b"], maxLength: 10 }))).toBe(9);   // 1023 (2047 > 2000)
    expect(lengthFor(readRules({ machine: "PDA", alphabet: ["a", "b", "c"] }))).toBe(6);       // 1093 (3280 > 2000)
    expect(lengthFor(readRules({ machine: "PDA", alphabet: ["a", "b", "c", "d"] }))).toBe(5);  // 1365
    expect(lengthFor(readRules({ machine: "PDA", alphabet: ["a"], maxLength: 4 }))).toBe(4);
    expect(MACHINE_DESIGN_LIMITS.wordBudget).toBe(2000);
  });
});

// Turing machines (unit 10's conventions: blank ∆; the answer of a function between two $)
const tmT = (from, read, write, move, to) => ({ from, read, write, move, to });
// recognise: words over {a, b} that start with a (scan right; accept on the first symbol a)
const STARTS_A = { states: ["q0", "q1"], start: "q0", accept: ["q1"], transitions: [tmT("q0", "a", "a", "S", "q1")] };
const TM_RULES = { machine: "TM", alphabet: ["a", "b"], maxStates: 6 };
const TM_KEY = { kind: "machine-design", rules: TM_RULES, reference: STARTS_A };
// compute: the number of a's in unary — run right; every a → x; at the end write $, then one a for each x, then $
// (a simple reference: copy is long; here the function «the word itself between two $»: write $ at the left end? — the course's
// convention is the answer between the first two $): f(w) = w, written as w$$ ↦ answer "" — no. Use f(w) = "" by w$$.
const EMPTY_ANSWER = { states: ["q0", "q1", "q2"], start: "q0", accept: ["q2"], transitions: [tmT("q0", "a", "a", "R", "q0"), tmT("q0", "b", "b", "R", "q0"), tmT("q0", "∆", "$", "R", "q1"), tmT("q1", "∆", "$", "S", "q2")] };
const ONE_A_ANSWER = { states: ["q0", "q1", "q2", "q3"], start: "q0", accept: ["q3"], transitions: [tmT("q0", "a", "a", "R", "q0"), tmT("q0", "b", "b", "R", "q0"), tmT("q0", "∆", "$", "R", "q1"), tmT("q1", "∆", "a", "R", "q2"), tmT("q2", "∆", "$", "S", "q3")] };
const ONE_DOLLAR = { states: ["q0", "q1"], start: "q0", accept: ["q1"], transitions: [tmT("q0", "a", "a", "R", "q0"), tmT("q0", "b", "b", "R", "q0"), tmT("q0", "∆", "$", "S", "q1")] };
const COMPUTE_KEY = { kind: "machine-design", rules: { machine: "TM", alphabet: ["a", "b"], mode: "compute", maxStates: 6 }, reference: EMPTY_ANSWER };

describe("AUTO-A10 — Turing machines: recognise a language, compute a function, and not halting", () => {
  it("recognise: the reference agrees; a wrong machine gets the shortest separating word", () => {
    expect(judge(STARTS_A, TM_KEY)).toMatchObject({ correct: true, agreesUpTo: { length: 8, words: 511 } });
    const startsB = { ...STARTS_A, transitions: [tmT("q0", "b", "b", "S", "q1")] };
    expect(judge(startsB, TM_KEY)).toEqual({ status: "judged", correct: false, counterexample: { word: "a", shouldAccept: true } });
  });
  it("a learner machine that does not halt where the reference does: said so, never a «counterexample», never «agrees»", () => {
    const loops = { states: ["q0", "q1"], start: "q0", accept: ["q1"], transitions: [tmT("q0", "a", "a", "S", "q1"), tmT("q0", "b", "b", "S", "q0")] };
    expect(judge(loops, TM_KEY)).toEqual({ status: "judged", correct: false, nohalt: { word: "b" } });
  });
  it("words on which the REFERENCE does not halt are skipped (counted), never judged", () => {
    const refLoopsOnB = { states: ["q0", "q1"], start: "q0", accept: ["q1"], transitions: [tmT("q0", "a", "a", "S", "q1"), tmT("q0", "b", "b", "S", "q0")] };
    const key = { ...TM_KEY, reference: refLoopsOnB };
    const r = judge(STARTS_A, key);
    expect(r.correct).toBe(true);
    expect(r.agreesUpTo).toEqual({ length: 8, words: 256, skipped: 255 });   // every word that starts with b is skipped
  });
  it("compute: the answer between the first two $; a different answer, or none, is the counterexample", () => {
    expect(judge(EMPTY_ANSWER, COMPUTE_KEY)).toMatchObject({ correct: true });
    expect(judge(ONE_A_ANSWER, COMPUTE_KEY)).toEqual({ status: "judged", correct: false, counterexample: { word: "", expected: "", got: "a" } });
    expect(judge(ONE_DOLLAR, COMPUTE_KEY)).toEqual({ status: "judged", correct: false, counterexample: { word: "", expected: "", got: null } });
  });
  it("compute (A10b, owner decision): a word the reference halts on WITHOUT accepting is outside the function — skipped, never judged", () => {
    // x + y over {1, #}: the book's machine, defined on 1…1#1…1 only; on «1», «##», «1#1#»… it halts in a state that does not accept
    const XPLUSY = { states: ["q0", "q1", "q2", "q3"], start: "q0", accept: ["q3"], transitions: [tmT("q0", "1", "$", "R", "q1"), tmT("q1", "1", "1", "R", "q1"),
      tmT("q1", "#", "1", "R", "q2"), tmT("q0", "#", "$", "R", "q2"), tmT("q2", "1", "1", "R", "q2"), tmT("q2", "∆", "$", "R", "q3")] };
    const key = { kind: "machine-design", rules: { machine: "TM", alphabet: ["1", "#"], mode: "compute", maxStates: 6 }, reference: XPLUSY };
    const domain = n => { let c = 0; for (let len = 1; len <= n; len++) c += len; return c; };   // 1ᵃ#1ᵇ with a + b + 1 = len: len words
    expect(judge(XPLUSY, key)).toEqual({ status: "judged", correct: true, agreesUpTo: { length: 8, words: domain(8), skipped: 511 - domain(8) } });
    // another machine for x + y that writes garbage (or never stops) outside the domain still agrees
    const garbage = { ...XPLUSY, states: [...XPLUSY.states, "g"], transitions: [...XPLUSY.transitions, tmT("q2", "#", "#", "S", "g"), tmT("g", "#", "$", "R", "g")] };
    expect(judge(garbage, key)).toMatchObject({ correct: true });
    const loopsOutside = { ...XPLUSY, transitions: [...XPLUSY.transitions, tmT("q1", "∆", "∆", "S", "q1")] };   // «1», «11»…: runs forever
    expect(judge(loopsOutside, key)).toMatchObject({ correct: true });
    // on the domain the answers are compared: x + y + 1 is wrong on «#» (0 + 0), the shortest word of the domain
    const plusOne = { ...XPLUSY, states: [...XPLUSY.states, "q4"], transitions: XPLUSY.transitions.map(t => (t.from === "q2" && t.read === "∆" ? tmT("q2", "∆", "1", "R", "q4") : t)).concat([tmT("q4", "∆", "$", "R", "q3")]) };
    expect(judge(plusOne, key)).toEqual({ status: "judged", correct: false, counterexample: { word: "#", expected: "", got: "1" } });
    // a RECOGNISE task still judges every halted word (a reject is a verdict there, not «outside»)
    expect(judge({ ...STARTS_A, accept: [] }, TM_KEY)).toMatchObject({ correct: false, counterexample: { word: "a", shouldAccept: true } });
  });
  it("the lean halt agrees with the book's engine on every word up to length 6", () => {
    for (const m of [STARTS_A, EMPTY_ANSWER, ONE_A_ANSWER]) {
      const tm = readAutomatonConfig({ automaton: { kind: "TM", alphabet: ["a", "b"], blank: "∆", ...m } }).machine;
      let level = [""];
      for (let n = 0; n <= 6; n++) {
        for (const w of level) expect(tmHalt(tm, [...w]).verdict, w).toBe(runAutomaton(tm, [...w]).verdict);
        level = level.flatMap(w => ["a", "b"].map(s => w + s));
      }
    }
  });
});

describe("AUTO-A10 — a broken key is unavailable, never a wrong", () => {
  it("rules or a reference that do not read; a compute mode for a push-down automaton; no word the reference decides", () => {
    for (const k of [
      { ...KEY, kind: "automaton-design" }, { ...KEY, rules: { ...PDA_RULES, machine: "NFA" } }, { ...KEY, rules: { ...PDA_RULES, alphabet: [] } },
      { ...KEY, rules: { ...PDA_RULES, alphabet: ["a", "a"] } }, { ...KEY, rules: { ...PDA_RULES, alphabet: ["a", "b", "c", "d", "e"] } },
      { ...KEY, rules: { ...PDA_RULES, maxStates: 13 } }, { ...KEY, rules: { ...PDA_RULES, mode: "compute" } }, { ...KEY, rules: { ...PDA_RULES, maxLength: 11 } },
      { ...KEY, reference: { ...ANBN, start: "nope" } }, { ...KEY, reference: "ANBN" },
    ]) expect(evaluateMachineDesign(k, { kind: "machine-design", machine: ANBN }), JSON.stringify(k).slice(0, 80)).toEqual({ status: "unavailable" });
    // a reference that halts on no word decides nothing: unavailable (never «agrees» on zero words)
    const never = { ...TM_KEY, reference: { states: ["q0"], start: "q0", accept: [], transitions: [tmT("q0", "a", "a", "S", "q0"), tmT("q0", "b", "b", "S", "q0"), tmT("q0", "∆", "∆", "S", "q0")] } };
    expect(judge(STARTS_A, never)).toEqual({ status: "unavailable" });
  });
  it("never throws", () => {
    expect(() => evaluateMachineDesign(undefined, undefined)).not.toThrow();
    expect(evaluateMachineDesign({ kind: "machine-design", rules: PDA_RULES, reference: ANBN }, { kind: "machine-design", machine: { states: [{}], start: {}, accept: 1, transitions: [null] } })).toEqual({ status: "judged", correct: false, issue: { code: "malformed" } });
  });
});

// ── the real practice route, with the course's REAL generated check and study indexes ─────────────────────────────
import { handler } from "../src/functions/learning-study.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { studyDocName } from "../src/lib/learning-study.js";
import { loadCheckIndex } from "../src/lib/learning-check.js";

const CID = "899271", MID = "899271-m08", PAGE = "899271-m08-l04-p02", ACT = "m08-l04-p02-b06";   // «صمّم الآلة: aⁿb²ⁿ»
const USR = id => "platform/users/" + id + ".json", CLS = id => "platform/classes/" + id + ".json";
const student = (id, classId) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId, displayName: "علي", code: "S1" });
const room = (id, visible) => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: [], learningMaterials: [{ courseId: CID, visibleModuleIds: visible }] });
const BUILDER_NO = { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }) };
const seed = (visible = [MID]) => createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA", visible) });
const studentDeps = ctx => ({ ...BUILDER_NO, requireStudentAuth: () => ({ ok: true, user: { sub: "u1", sv: 1, role: "student", classId: "STALE" } }), container: ctx.container, getContainer: () => ctx.container });
const attempt = (deps, response) => handler({ method: "POST", url: "https://x/api/learning-study", headers: { get: () => null }, params: { courseId: CID, action: "attempt" }, json: async () => ({ pageId: PAGE, activityId: ACT, response }) }, deps);
const written = ctx => ctx.names("platform/").filter(n => !n.startsWith("platform/users/") && !n.startsWith("platform/classes/"));
const design = machine => ({ kind: "machine-design", machine });
// a learner's aⁿb²ⁿ: other state names than the book's
const ANB2N = { states: ["s", "p", "r", "f"], start: "s", accept: ["s", "f"], transitions: [
  { from: "s", read: "a", top: "⏊", op: "push", write: "SA", to: "p" }, { from: "p", read: "a", top: "A", op: "push", write: "AA", to: "p" },
  { from: "p", read: "b", top: "A", op: "pop", write: "A", to: "r" }, { from: "r", read: "b", top: "A", op: "pop", write: "A", to: "r" },
  { from: "r", read: "b", top: "S", op: "pop", write: "S", to: "f" }] };

describe("POST /api/learning-study/899271/attempt — a push-down «صمّم الآلة» through the real indexes", () => {
  it("the generated check index holds the reference and the rules; the exercise is a study activity", () => {
    const entry = loadCheckIndex(CID).pages[PAGE].activities[ACT];
    expect(entry.key.kind).toBe("machine-design");
    expect(entry.key.rules).toEqual({ machine: "PDA", alphabet: ["a", "b"], maxStates: 6 });
    expect(entry.study).toBe(true);
  });
  it("wrong: the separating word and the hints, nothing written; right: «agrees up to length 8», completed once", async () => {
    const ctx = seed();
    const w = await attempt(studentDeps(ctx), design({ ...ANB2N, accept: ["f"] }));
    expect(w.status).toBe(200);
    expect(w.jsonBody).toMatchObject({ ok: true, correct: false, persisted: false, counterexample: { word: "", shouldAccept: true } });
    expect(w.jsonBody.feedback.hints.length).toBeGreaterThan(0);
    expect(JSON.stringify(w.jsonBody)).not.toMatch(/reference|"rules"|"q3"/);
    expect(written(ctx)).toEqual([]);
    const r = await attempt(studentDeps(ctx), design(ANB2N));
    expect(r.jsonBody).toMatchObject({ correct: true, persisted: true, agreesUpTo: { length: 8, words: 511 } });
    expect(r.jsonBody.feedback.explanation).toContain("رمزين");
    expect(written(ctx)).toEqual([studyDocName("u1")]);
  });
  it("an answer over 16 KB → 413; a broken reference → 503 retryable, nothing written", async () => {
    const ctx = seed();
    expect((await attempt(studentDeps(ctx), design({ ...ANB2N, states: ["s", "p", "x".repeat(17000)] }))).status).toBe(413);
    const broken = JSON.parse(JSON.stringify(loadCheckIndex(CID)));
    broken.pages[PAGE].activities[ACT].key.reference.start = "nope";
    const r = await handler({ method: "POST", url: "https://x/api/learning-study", headers: { get: () => null }, params: { courseId: CID, action: "attempt" }, json: async () => ({ pageId: PAGE, activityId: ACT, response: design(ANB2N) }) },
      { ...studentDeps(ctx), loadCheckIndex: id => (id === CID ? broken : null) });
    expect(r.status).toBe(503);
    expect(r.jsonBody).toMatchObject({ ok: false, retryable: true, error: "تعذّر فحص الآلة حاليًا. حاول مرة أخرى بعد قليل." });
    expect(written(ctx)).toEqual([]);
  });
});

describe("learning-check — a machine-design verdict reaches the route unchanged", () => {
  it("a Turing machine that does not halt where the reference does: `nohalt` is passed through, never a counterexample", async () => {
    const { checkResponse } = await import("../src/lib/learning-check.js");
    const loops = { states: ["q0", "q1"], start: "q0", accept: ["q1"], transitions: [tmT("q0", "a", "a", "S", "q1"), tmT("q0", "b", "b", "S", "q0")] };
    const out = checkResponse({ key: TM_KEY, feedback: { hints: ["h"] } }, { kind: "machine-design", machine: loops });
    expect(out.correct).toBe(false);
    expect(out.nohalt).toEqual({ word: "b" });
    expect(out.counterexample).toBeUndefined();
    expect(out.agreesUpTo).toBeUndefined();
    const right = checkResponse({ key: TM_KEY, feedback: {} }, { kind: "machine-design", machine: STARTS_A });
    expect(right).toMatchObject({ correct: true, agreesUpTo: { length: 8, words: 511 } });
    expect(right.nohalt).toBeUndefined();
  });
});
