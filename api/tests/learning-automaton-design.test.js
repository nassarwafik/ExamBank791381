import { describe, it, expect } from "vitest";
import { evaluateAutomatonDesign, AUTOMATON_DESIGN_LIMITS } from "../src/lib/learning-automaton-design.js";

// AUTO-A3 (docs/enterprise-automata-design-a3.md) — the SERVER judge of «صمّم الآلة»: the learner's machine is right only when
// it accepts EXACTLY the reference language; a wrong one gets the SHORTEST word on which the two disagree (shortlex); a public
// rule broken → a named issue; a broken key → `unavailable` (never a wrong).

// Reference: even number of a's over {a,b} (the course's unit 3 machine).
const EVEN_A = { states: ["q0", "q1"], start: "q0", accept: ["q0"], transitions: [["q0", "a", "q1"], ["q1", "a", "q0"], ["q0", "b", "q0"], ["q1", "b", "q1"]] };
const RULES = { machine: "DFA", alphabet: ["a", "b"], maxStates: 4, complete: true };
const KEY = { kind: "automaton-design", rules: RULES, reference: EVEN_A };
const judge = (machine, key = KEY) => evaluateAutomatonDesign(key, { kind: "automaton-design", machine });

describe("AUTO-A3 — the language-equivalence judge", () => {
  it("the reference itself is right", () => {
    expect(judge(EVEN_A)).toEqual({ status: "judged", correct: true });
  });

  it("a different machine for the SAME language is right (renamed states, a redundant state)", () => {
    const m = { states: ["A", "B", "C"], start: "A", accept: ["A", "C"], transitions: [["A", "a", "B"], ["B", "a", "C"], ["C", "a", "B"], ["A", "b", "A"], ["B", "b", "B"], ["C", "b", "C"]] };
    expect(judge(m)).toEqual({ status: "judged", correct: true });
  });

  it("a wrong machine gets the shortest separating word, and whether the reference accepts it", () => {
    // accepts everything: the empty word is right, «a» is the first word it should reject
    const all = { states: ["q0"], start: "q0", accept: ["q0"], transitions: [["q0", "a", "q0"], ["q0", "b", "q0"]] };
    expect(judge(all)).toEqual({ status: "judged", correct: false, counterexample: { word: "a", shouldAccept: false } });
    // accept set swapped: the very first word (ε) already differs
    const odd = { ...EVEN_A, accept: ["q1"] };
    expect(judge(odd)).toEqual({ status: "judged", correct: false, counterexample: { word: "", shouldAccept: true } });
  });

  it("the counterexample is shortlex-first: shortest, then alphabet order", () => {
    // reference: words that contain «bb»; learner: words that contain «aa» — first difference among length 2 is «aa» (a < b)
    const key = { kind: "automaton-design", rules: { machine: "NFA", alphabet: ["a", "b"] }, reference: { states: ["p", "r", "f"], start: "p", accept: ["f"], transitions: [["p", "a", "p"], ["p", "b", "p"], ["p", "b", "r"], ["r", "b", "f"], ["f", "a", "f"], ["f", "b", "f"]] } };
    const aa = { states: ["p", "r", "f"], start: "p", accept: ["f"], transitions: [["p", "a", "p"], ["p", "b", "p"], ["p", "a", "r"], ["r", "a", "f"], ["f", "a", "f"], ["f", "b", "f"]] };
    expect(judge(aa, key)).toEqual({ status: "judged", correct: false, counterexample: { word: "aa", shouldAccept: false } });
  });

  it("an NFA (with ε) is compared by its language: second-to-last symbol is b", () => {
    const key = { kind: "automaton-design", rules: { machine: "NFA", alphabet: ["a", "b"] }, reference: { states: ["s", "t", "u"], start: "s", accept: ["u"], transitions: [["s", "a", "s"], ["s", "b", "s"], ["s", "b", "t"], ["t", "a", "u"], ["t", "b", "u"]] } };
    // the same language through an ε arrow
    const withEps = { states: ["s", "e", "t", "u"], start: "s", accept: ["u"], transitions: [["s", "a", "s"], ["s", "b", "s"], ["s", "b", "e"], ["e", "ε", "t"], ["t", "a", "u"], ["t", "b", "u"]] };
    expect(judge(withEps, key)).toEqual({ status: "judged", correct: true });
    // λ is the course's other name for ε
    const withLambda = { ...withEps, transitions: withEps.transitions.map(t => (t[1] === "ε" ? [t[0], "λ", t[2]] : t)) };
    expect(judge(withLambda, key)).toEqual({ status: "judged", correct: true });
    // the 4-state DFA of the same language is also right for an NFA task
    const dfa = { states: ["aa", "ab", "ba", "bb"], start: "aa", accept: ["ba", "bb"], transitions: [["aa", "a", "aa"], ["aa", "b", "ab"], ["ab", "a", "ba"], ["ab", "b", "bb"], ["ba", "a", "aa"], ["ba", "b", "ab"], ["bb", "a", "ba"], ["bb", "b", "bb"]] };
    expect(judge(dfa, key)).toEqual({ status: "judged", correct: true });
  });

  it("a partial DFA is allowed when the task does not ask for a complete one (a missing arrow = the word is rejected)", () => {
    const key = { ...KEY, rules: { machine: "DFA", alphabet: ["a", "b"] }, reference: { states: ["q0", "q1"], start: "q0", accept: ["q1"], transitions: [["q0", "a", "q1"]] } };
    expect(judge({ states: ["x", "y"], start: "x", accept: ["y"], transitions: [["x", "a", "y"]] }, key)).toEqual({ status: "judged", correct: true });
    expect(judge({ states: ["x", "y"], start: "x", accept: ["y"], transitions: [["x", "a", "y"], ["y", "a", "y"]] }, key))
      .toEqual({ status: "judged", correct: false, counterexample: { word: "aa", shouldAccept: false } });
  });
});

describe("AUTO-A3 — the public rules of the task", () => {
  const issue = m => judge(m).issue;
  it("a complete DFA is required: the first missing (state, symbol) is named", () => {
    expect(issue({ ...EVEN_A, transitions: EVEN_A.transitions.filter(t => !(t[0] === "q1" && t[1] === "b")) })).toEqual({ code: "incomplete", state: "q1", symbol: "b" });
  });
  it("two arrows for one symbol in a DFA", () => {
    expect(issue({ ...EVEN_A, transitions: [...EVEN_A.transitions, ["q0", "a", "q0"]] })).toEqual({ code: "two-arrows", state: "q0", symbol: "a" });
  });
  it("the same arrow twice is not two arrows", () => {
    expect(judge({ ...EVEN_A, transitions: [...EVEN_A.transitions, ["q0", "a", "q1"]] })).toEqual({ status: "judged", correct: true });
  });
  it("ε in a DFA, a symbol outside the alphabet, too many states, no start, no states", () => {
    expect(issue({ ...EVEN_A, transitions: [...EVEN_A.transitions, ["q0", "ε", "q1"]] })).toEqual({ code: "epsilon-in-dfa" });
    expect(issue({ ...EVEN_A, transitions: [...EVEN_A.transitions, ["q0", "c", "q1"]] })).toEqual({ code: "symbol-outside-alphabet", symbol: "c" });
    expect(issue({ states: ["a1", "a2", "a3", "a4", "a5"], start: "a1", accept: [], transitions: [] })).toEqual({ code: "too-many-states", max: 4 });
    expect(issue({ ...EVEN_A, start: "zz" })).toEqual({ code: "no-start" });
    expect(issue({ ...EVEN_A, states: [] })).toEqual({ code: "no-states" });
  });
  it("malformed machines are wrong, never thrown", () => {
    for (const m of [null, 7, "x", [], { states: "q0" }, { ...EVEN_A, accept: ["nope"] }, { ...EVEN_A, transitions: [["q0", "a"]] }, { ...EVEN_A, transitions: [[1, 2, 3]] }, { ...EVEN_A, states: ["q0", "q0"] }, { ...EVEN_A, states: ["0bad", "q1"] }]) {
      const r = judge(m);
      expect(r.status).toBe("judged");
      expect(r.correct).toBe(false);
      expect(r.issue).toBeTruthy();
      expect(r.counterexample).toBeUndefined();
    }
  });
  it("only `machine` is read: a forged verdict in the response changes nothing", () => {
    const odd = { ...EVEN_A, accept: ["q1"] };
    const r = evaluateAutomatonDesign(KEY, { kind: "automaton-design", machine: odd, correct: true, score: 1, counterexample: null });
    expect(r.correct).toBe(false);
    expect(evaluateAutomatonDesign(KEY, { kind: "network-lab", machine: EVEN_A })).toEqual({ status: "judged", correct: false, issue: { code: "malformed" } });
    expect(evaluateAutomatonDesign(KEY, null)).toEqual({ status: "judged", correct: false, issue: { code: "malformed" } });
  });
});

describe("AUTO-A3 — a broken key is unavailable, never a wrong", () => {
  it("rules or reference that do not read", () => {
    const broken = [
      null, {}, { ...KEY, kind: "network-lab" },
      { ...KEY, rules: { ...RULES, machine: "PDA" } },
      { ...KEY, rules: { ...RULES, alphabet: [] } },
      { ...KEY, rules: { ...RULES, alphabet: ["a", "a"] } },
      { ...KEY, rules: { ...RULES, maxStates: 0 } },
      { ...KEY, rules: { ...RULES, maxStates: AUTOMATON_DESIGN_LIMITS.states + 1 } },
      { ...KEY, rules: { machine: "NFA", alphabet: ["a"], complete: true } },
      { ...KEY, reference: { ...EVEN_A, start: "nope" } },
      { ...KEY, reference: { ...EVEN_A, transitions: [["q0", "z", "q1"]] } },
    ];
    for (const key of broken) expect(evaluateAutomatonDesign(key, { kind: "automaton-design", machine: EVEN_A })).toEqual({ status: "unavailable" });
  });

  it("the worst learner NFA within the rules is still judged (the pair bound is never the learner's to hit)", () => {
    // the n-th-from-last NFA over 12 states reaches 2¹¹ state sets
    const n = AUTOMATON_DESIGN_LIMITS.states;
    const states = Array.from({ length: n }, (_, i) => "s" + i);
    const transitions = [["s0", "a", "s0"], ["s0", "b", "s0"], ["s0", "b", "s1"]];
    for (let i = 1; i < n - 1; i++) transitions.push(["s" + i, "a", "s" + (i + 1)], ["s" + i, "b", "s" + (i + 1)]);
    const machine = { states, start: "s0", accept: ["s" + (n - 1)], transitions };
    // against itself as the reference: equal, so the WHOLE product is explored (no early difference)
    const key = { kind: "automaton-design", rules: { machine: "NFA", alphabet: ["a", "b"] }, reference: machine };
    const t0 = Date.now();
    expect(judge(machine, key)).toEqual({ status: "judged", correct: true });
    expect(Date.now() - t0).toBeLessThan(2000);
    // and one step off (accept one state earlier): wrong, with the shortest separating word
    const r = judge({ ...machine, accept: ["s" + (n - 2)] }, key);
    expect(r).toEqual({ status: "judged", correct: false, counterexample: { word: "b" + "a".repeat(n - 3), shouldAccept: false } });
  });
});

// ── the real practice route, with the course's REAL generated check and study indexes ───────────────────────────────
import { handler } from "../src/functions/learning-study.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { studyDocName } from "../src/lib/learning-study.js";
import { loadCheckIndex } from "../src/lib/learning-check.js";

const CID = "899271", MID = "899271-m02", PAGE = "899271-m02-l04-p02", ACT = "m02-l04-p02-b06";   // «صمّم الآلة: تنتهي بـ 1»
const USR = id => "platform/users/" + id + ".json", CLS = id => "platform/classes/" + id + ".json";
const student = (id, classId) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId, displayName: "علي", code: "S1" });
const room = (id, visible) => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: [], learningMaterials: [{ courseId: CID, visibleModuleIds: visible }] });
const BUILDER_NO = { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }) };
const BUILDER_OK = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
const seed = (visible = [MID]) => createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA", visible) });
const studentDeps = ctx => ({ ...BUILDER_NO, requireStudentAuth: () => ({ ok: true, user: { sub: "u1", sv: 1, role: "student", classId: "STALE" } }), container: ctx.container, getContainer: () => ctx.container });
const teacherDeps = ctx => ({ ...BUILDER_OK, container: ctx.container, getContainer: () => ctx.container });
const attempt = (deps, response, extra = {}) => handler({ method: "POST", url: "https://x/api/learning-study", headers: { get: () => null }, params: { courseId: CID, action: "attempt" }, json: async () => ({ pageId: PAGE, activityId: ACT, response, ...extra }) }, deps);
const written = ctx => ctx.names("platform/").filter(n => !n.startsWith("platform/users/") && !n.startsWith("platform/classes/"));
const design = machine => ({ kind: "automaton-design", machine });
const ENDS_1 = { states: ["q0", "q1"], start: "q0", accept: ["q1"], transitions: [["q0", "0", "q0"], ["q0", "1", "q1"], ["q1", "0", "q0"], ["q1", "1", "q1"]] };

describe("POST /api/learning-study/899271/attempt — «صمّم الآلة» through the real indexes", () => {
  it("the generated check index holds the reference; the exercise is a study activity", () => {
    const entry = loadCheckIndex(CID).pages[PAGE].activities[ACT];
    expect(entry.key.kind).toBe("automaton-design");
    expect(entry.key.rules).toEqual({ machine: "DFA", alphabet: ["0", "1"], maxStates: 4, complete: true });
    expect(entry.study).toBe(true);
  });

  it("wrong: the separating word and the hints, nothing written; right: completed once with the explanation; a repeat is read-only", async () => {
    const ctx = seed();
    const all = { states: ["q0"], start: "q0", accept: ["q0"], transitions: [["q0", "0", "q0"], ["q0", "1", "q0"]] };
    const w = await attempt(studentDeps(ctx), design(all));
    expect(w.status).toBe(200);
    expect(w.jsonBody).toMatchObject({ ok: true, correct: false, persisted: false, gained: 0, study: true, counterexample: { word: "", shouldAccept: false } });
    expect(w.jsonBody.feedback.hints.length).toBeGreaterThan(0);
    expect(w.jsonBody.feedback.explanation).toBeUndefined();
    // the answer never leaves: no reference state set, no transitions of the key
    expect(JSON.stringify(w.jsonBody)).not.toMatch(/reference|transitions|"rules"/);
    expect(written(ctx)).toEqual([]);
    const r = await attempt(studentDeps(ctx), design(ENDS_1));
    expect(r.jsonBody).toMatchObject({ correct: true, persisted: true, alreadyCompleted: false });
    expect(r.jsonBody.feedback.explanation).toContain("حالتان تكفيان");
    expect(r.jsonBody.counterexample).toBeUndefined();
    expect(r.jsonBody.gained).toBeGreaterThan(0);
    const again = await attempt(studentDeps(ctx), design(ENDS_1));
    expect(again.jsonBody).toMatchObject({ correct: true, persisted: false, alreadyCompleted: true, gained: 0 });
    expect(written(ctx)).toEqual([studyDocName("u1")]);
    expect(Object.keys(ctx.getJson(studyDocName("u1")).pages[PAGE].completed)).toEqual([ACT]);
  });

  it("a broken public rule (incomplete DFA) is wrong with the rule named; a forged verdict is ignored; nothing written", async () => {
    const ctx = seed();
    const partial = { ...ENDS_1, transitions: ENDS_1.transitions.slice(0, 3) };
    const r = await attempt(studentDeps(ctx), { ...design(partial), correct: true }, { correct: true, points: 20 });
    expect(r.jsonBody).toMatchObject({ correct: false, persisted: false, issue: { code: "incomplete", state: "q1", symbol: "1" } });
    expect(written(ctx)).toEqual([]);
  });

  it("an answer over 16 KB → 413 before any judging; nothing written", async () => {
    const ctx = seed();
    const huge = design({ ...ENDS_1, states: ["q0", "q1", "x".repeat(17000)] });
    const r = await attempt(studentDeps(ctx), huge);
    expect(r.status).toBe(413);
    expect(written(ctx)).toEqual([]);
  });

  it("a broken reference → 503 retryable with its own message, NOTHING written, never a wrong verdict", async () => {
    const ctx = seed();
    const real = loadCheckIndex(CID);
    const broken = JSON.parse(JSON.stringify(real));
    broken.pages[PAGE].activities[ACT].key.reference.start = "nope";
    const r = await handler({ method: "POST", url: "https://x/api/learning-study", headers: { get: () => null }, params: { courseId: CID, action: "attempt" }, json: async () => ({ pageId: PAGE, activityId: ACT, response: design(ENDS_1) }) },
      { ...studentDeps(ctx), loadCheckIndex: id => (id === CID ? broken : null) });
    expect(r.status).toBe(503);
    expect(r.jsonBody).toMatchObject({ ok: false, retryable: true, error: "تعذّر فحص الآلة حاليًا. حاول مرة أخرى بعد قليل." });
    expect("correct" in r.jsonBody).toBe(false);
    expect(written(ctx)).toEqual([]);
  });

  it("the gate: the module unpublished → 403; a teacher is judged and never persisted", async () => {
    expect((await attempt(studentDeps(seed([])), design(ENDS_1))).status).toBe(403);
    const ctx = seed();
    const t = await attempt(teacherDeps(ctx), design(ENDS_1));
    expect(t.jsonBody).toMatchObject({ actor: "teacher", correct: true, persisted: false, gained: 0 });
    expect(written(ctx)).toEqual([]);
  });
});
