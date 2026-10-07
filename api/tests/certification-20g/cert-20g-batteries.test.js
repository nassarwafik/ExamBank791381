import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { familyQuestion, STANDALONE_FAMILIES } from "./exams/S-stress.js";
import { scanProjection } from "./scan.js";
import { attemptInvariants } from "./ledger.js";
import * as K from "./kit.js";
import { validateStructuredExam } from "../../../src/examQuality";
import { parseStructuredExamJson } from "../../../src/structuredExamImport";
import { buildSimFromSpec } from "../../../src/aiComposer/composerSim";
import * as FAKE from "../../../src/aiComposer/testing/composerFakeAi";

// Phase 20G — deterministic SEEDED batteries (§23). Each battery draws its cases from mulberry32(seed) — a failure prints the seed and the case
// index, so any defect reduces to a minimal, replayable regression. Seeds are fixed (reproducible in CI); BATTERY_SEED overrides them locally
// for exploratory runs. Nothing here is random at runtime unless explicitly asked.
const require_ = createRequire(import.meta.url);
const { gradeExam } = require_("../../src/lib/assignment-grading.js");
const { examOfficialStats, selectGradedUnits, normalizeExamStructure } = require_("../../src/lib/exam-structure.js");
const { normalizeDraftAnswers } = require_("../../src/lib/draft-answers.js");
const { sanitizeExamForStudent } = require_("../../src/lib/student-exam-sanitize.js");
const { A } = K;
const SEED = Number(process.env.BATTERY_SEED || 20251007);
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rng = salt => { const r = mulberry32(SEED ^ salt); return { r, int: (lo, hi) => lo + Math.floor(r() * (hi - lo + 1)), pick: arr => arr[Math.floor(r() * arr.length)], bool: () => r() < 0.5 }; };
const N = 60;

/** A random but VALID exam: random families, random marks (via the mark field), random section policies. Returns exam + per-question answers. */
function randomExam(g, k) {
  const sections = [], answers = {};
  const nS = g.int(1, 4);
  for (let s = 0; s < nS; s++) {
    const qs = [];
    const nQ = g.int(1, 8);
    for (let i = 0; i < nQ; i++) {
      const fam = g.pick(STANDALONE_FAMILIES.filter(f => f !== "parametricNumeric"));
      const id = "r" + k + "-" + s + "-" + i;
      const [node, ans] = familyQuestion(fam, id);
      if (!fam.startsWith("coding") && !fam.startsWith("smartSim") && fam !== "openResponse" && fam !== "networkCli") node.marks = g.int(1, 9);   // the families with marks-free scoring rules
      qs.push(node);
      if (ans && g.bool()) answers[id] = ans;
    }
    const policy = g.int(0, 2);
    if (policy === 0) sections.push(K.section("s" + s, "قسم " + s, qs));
    else if (policy === 1) sections.push(K.section("s" + s, "قسم " + s, qs, { gradingPolicy: "capScore", maxMarks: g.int(1, 30) }));
    else sections.push(K.section("s" + s, "قسم " + s, qs, { gradingPolicy: "firstNAnswered", answerUnit: "question", requiredAnswers: g.int(1, qs.length), maxMarks: g.int(1, 30) }));
  }
  return { exam: K.exam("RAND-" + k, "عشوائي " + k, sections), answers };
}

describe("20G seeded batteries (seed " + SEED + ")", () => {
  it("MARKS: official total = gradeExam total = Σ section maxima; scores within bounds; every invariant holds (" + N + " random exams)", () => {
    const g = rng(1);
    for (let k = 0; k < N; k++) {
      const { exam, answers } = randomExam(g, k);
      const norm = normalizeDraftAnswers(answers, exam).answers;
      const r = gradeExam(exam, norm, { parametric: { assignmentId: "a", studentId: "s", attemptNumber: 1 } });
      const total = examOfficialStats(exam).totalMarks;
      expect(r.totalMarks, "seed " + SEED + " case " + k).toBe(total);
      const at = { ...r, questionGrades: r.questions };
      expect(attemptInvariants(at, total), "seed " + SEED + " case " + k).toEqual([]);
    }
  });
  it("FIRST-N: exactly the first N ANSWERED units in display order are counted; unanswered never take a slot; excess is ignored (" + N + " cases)", () => {
    const g = rng(2);
    for (let k = 0; k < N; k++) {
      const n = g.int(2, 8), req = g.int(1, n);
      const qs = Array.from({ length: n }, (_, i) => K.mcq("f" + i, "?", 2, ["أ", "ب"], 0));
      const exam = K.exam("FN", "fn", [K.section("s", "s", qs, { gradingPolicy: "firstNAnswered", answerUnit: "question", requiredAnswers: req, maxMarks: 2 * req })]);
      const answered = qs.filter(() => g.bool()).map(q => q.examQuestionId);
      const answers = Object.fromEntries(answered.map(id => [id, A.choice(g.int(0, 1))]));
      const { countedKeys } = selectGradedUnits(normalizeExamStructure(exam).sections[0], answers);
      expect([...countedKeys], "seed " + SEED + " case " + k).toEqual(answered.slice(0, req));
      const r = gradeExam(exam, answers);
      const expected = answered.slice(0, req).reduce((sum, id) => sum + (answers[id].index === 0 ? 2 : 0), 0);
      expect(r.score, "seed " + SEED + " case " + k).toBe(expected);
      for (const q of r.questions) if (!countedKeys.has(q.questionId)) expect([q.score, q.manualReview], q.questionId).toEqual([0, false]);
    }
  });
  it("IDS + NAMESPACE: an injected duplicate question id is always caught; composite part answers never collide with top-level answers", () => {
    const g = rng(3);
    for (let k = 0; k < N; k++) {
      const { exam } = randomExam(g, k);
      const all = exam.sections.flatMap(s => s.questions);
      if (all.length < 2) continue;
      const a = g.int(0, all.length - 1); let b = g.int(0, all.length - 1); if (b === a) b = (a + 1) % all.length;
      all[b].examQuestionId = all[a].examQuestionId;
      expect(validateStructuredExam(exam).map(i => i.code), "seed " + SEED + " case " + k).toContain("DUPLICATE_ID");
    }
    // a top-level question named like a composite child key never receives the child's answer
    const comp = K.composite("cx", "?", 2, [], [K.group("g", "g", [K.part("p1", "أ", K.mcq("x", "?", 2, ["أ", "ب"], 0))])]);
    const twin = K.mcq("cx::part::p1", "?", 2, ["أ", "ب"], 1);
    const exam = K.exam("NS", "ns", [K.section("s", "s", [comp, twin])]);
    const r = gradeExam(exam, { cx: A.composite({ p1: A.choice(0) }), "cx::part::p1": A.choice(0) });
    expect(r.questions.map(q => q.score)).toEqual([2, 0]);
  });
  it("ROUND TRIP: export → import → export is byte-identical for random exams (" + N + ")", () => {
    const g = rng(4);
    for (let k = 0; k < N; k++) {
      const { exam } = randomExam(g, k);
      const imp = parseStructuredExamJson(JSON.stringify(exam), "r.json");
      expect(imp.parseErrors).toEqual([]);
      expect(JSON.stringify(imp.exam.sections.flatMap(s => s.questions)), "seed " + SEED + " case " + k).toBe(JSON.stringify(exam.sections.flatMap(s => s.questions)));
    }
  });
  it("PARAMETRIC IDENTITY: the same (assignment, student, attempt) always DELIVERS the same instance and the grader accepts exactly that instance; instances vary across identities", () => {
    const g = rng(5);
    const q = K.parametric("pq", "احسب {{a}} × {{b}}", 2, { v: 2, generatorVersion: 2, variables: [{ id: "a", kind: "integer", min: 1, max: 1000, step: 1 }, { id: "b", kind: "decimal", min: 0, max: 50, step: 0.5 }], derivedVariables: [], constraints: [], response: { unit: "none" } }, { expression: "a*b", mode: "tolerance", tolerance: 0.001 });
    const exam = K.exam("PI", "pi", [K.section("s", "s", [q])]);
    const seen = new Set();
    for (let k = 0; k < N; k++) {
      const id = { assignmentId: "as-" + g.int(1, 1e6), studentId: "st-" + g.int(1, 1e6), attemptNumber: g.int(1, 9) };
      const view = () => sanitizeExamForStudent(exam, { parametric: id }).sections[0].questions[0].parametric;
      const one = view(), two = view();
      expect(one.status, "seed " + SEED + " case " + k).toBe("ready");
      expect(JSON.stringify(two), "seed " + SEED + " case " + k).toBe(JSON.stringify(one));
      seen.add(JSON.stringify(one.values));
      const answer = Number(one.values.a) * Number(one.values.b);
      expect(gradeExam(exam, { pq: A.numeric(answer) }, { parametric: id }).score, "seed " + SEED + " case " + k).toBe(2);
      expect(gradeExam(exam, { pq: A.numeric(answer) }, { parametric: { ...id, attemptNumber: id.attemptNumber + 1 } }).score === 2 && JSON.stringify(sanitizeExamForStudent(exam, { parametric: { ...id, attemptNumber: id.attemptNumber + 1 } }).sections[0].questions[0].parametric.values) !== JSON.stringify(one.values), "seed " + SEED + " case " + k).toBe(false);
    }
    expect(seen.size).toBeGreaterThan(N * 0.9);
  });
  it("FORBIDDEN MARKERS: the student projection of " + N + " random exams carries no private key and no planted canary", () => {
    const g = rng(6);
    for (let k = 0; k < N; k++) {
      const { exam } = randomExam(g, k);
      for (const q of exam.sections.flatMap(s => s.questions)) { q.teacherNote = K.canary("RND-" + k); q.hint = K.canary("HINT-" + k); }
      expect(scanProjection(sanitizeExamForStudent(exam, { parametric: { assignmentId: "a", studentId: "s", attemptNumber: 1 } })), "seed " + SEED + " case " + k).toEqual([]);
    }
  });
  it("SMARTSIM REPLAY: the stored state is a pure function of the actions — never of the client's claimed state; replays are deterministic", () => {
    const g = rng(7);
    const [node] = familyQuestion("smartSim:physicsFreeFall@1", "ff");
    const exam = K.exam("SR", "sr", [K.section("s", "s", [node])]);
    for (let k = 0; k < N; k++) {
      const actions = Array.from({ length: g.int(0, 12) }, () => g.bool() ? { type: "measurement.set", measurementId: g.pick(["impactTime", "impactSpeed", "heightAt1s", "velocityAt1s"]), value: Math.round(g.r() * 4000) / 100 } : { type: "graphPoint.set", pointId: g.pick(["impactPoint", "pointAt1s"]), t: Math.round(g.r() * 300) / 100, y: Math.round(g.r() * 2000) / 100 });
      const a1 = normalizeDraftAnswers({ ff: A.sim("physicsFreeFall", 1, actions, { forged: g.r() }) }, exam).answers.ff;
      const a2 = normalizeDraftAnswers({ ff: A.sim("physicsFreeFall", 1, actions, { other: "claim", score: 12 }) }, exam).answers.ff;
      expect(a1, "seed " + SEED + " case " + k).toEqual(a2);
      expect(gradeExam(exam, { ff: a1 }).score).toBe(gradeExam(exam, { ff: a2 }).score);
    }
  });
  it("FUNCTION-STUDY KEYS: for random factored quadratics the correct key is accepted and a perturbed key is refused (" + Math.floor(N / 3) + " functions)", () => {
    const g = rng(8);
    for (let k = 0; k < Math.floor(N / 3); k++) {
      let r1 = g.int(-4, 3), r2 = g.int(-3, 4); if (r2 <= r1) r2 = r1 + g.int(1, 3);
      const a = g.pick([1, -1, 2]);
      const src = a + "*(x-(" + r1 + "))*(x-(" + r2 + "))";
      const vx = (r1 + r2) / 2, vy = a * (vx - r1) * (vx - r2);
      const spec = over => FAKE.funcSim({ source: src, xMin: -8, xMax: 8, yMin: -200, yMax: 200, tasks: ["xIntercepts", "yIntercept", "extrema"], domainExclusions: [], verticalAsymptotes: [], horizontalAsymptotes: [], intervals: [],
        xIntercepts: [r1, r2], yIntercept: a * r1 * r2, extrema: [{ kind: a > 0 ? "min" : "max", x: vx, y: vy }], ...over });
      const good = buildSimFromSpec(spec({}));
      expect(good.ok, "seed " + SEED + " case " + k + " " + src + " " + JSON.stringify(good.ok ? "" : good.issues)).toBe(true);
      expect(buildSimFromSpec(spec({ xIntercepts: [r1, r2 + 1] })).ok, "seed " + SEED + " case " + k).toBe(false);
      expect(buildSimFromSpec(spec({ extrema: [{ kind: a > 0 ? "max" : "min", x: vx, y: vy }] })).ok, "seed " + SEED + " case " + k).toBe(false);
    }
  });
  it("MALFORMED PAYLOADS: random junk answers never throw in ingest or grading and never produce a score (" + N * 2 + " payloads)", () => {
    const g = rng(9);
    const { exam } = randomExam(rng(99), 0);
    const ids = exam.sections.flatMap(s => s.questions).map(q => q.examQuestionId);
    const junk = () => g.pick([null, 0, -1, 1e308, "", "x".repeat(g.int(0, 50)), [], [1, [2]], { kind: g.pick(["choice", "fields", "smartSim", "code", "composite", "numeric", "networkCli", "hotspot", "codeTemplate", "x"]), index: g.pick([-1, 1.5, "0", null, 99]), values: g.pick([null, "a", [1], { a: { b: 1 } }]), actions: g.pick([null, "a", [{}], [{ type: "x" }]]), source: g.pick([null, 1, "print(1)"]), parts: g.pick([null, [], { a: 1 }]) }]);
    for (let k = 0; k < N * 2; k++) {
      const answers = Object.fromEntries(ids.map(id => [id, junk()]));
      let norm;
      expect(() => { norm = normalizeDraftAnswers(answers, exam); }, "seed " + SEED + " case " + k).not.toThrow();
      expect(() => gradeExam(exam, norm.answers, { parametric: { assignmentId: "a", studentId: "s", attemptNumber: 1 } }), "seed " + SEED + " case " + k).not.toThrow();
      expect(gradeExam(exam, norm.answers).score).toBeGreaterThanOrEqual(0);
    }
  });
});
