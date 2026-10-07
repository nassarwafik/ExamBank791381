import { describe, it, expect, beforeAll } from "vitest";
import { createRequire } from "node:module";
import { examD, PERSONAS, FN } from "./exams/D-mathematics.js";
import { publishAndAssign, takeExam } from "./lifecycle.js";
import { ledgerOf, attemptInvariants } from "./ledger.js";
import { scanProjection } from "./scan.js";
import { A } from "./kit.js";
import { evaluateExamFinalization } from "../../../src/examFinalization";
import { parseStructuredExamJson } from "../../../src/structuredExamImport";
import { buildSimFromSpec } from "../../../src/aiComposer/composerSim";
import * as FAKE from "../../../src/aiComposer/testing/composerFakeAi";

// Phase 20G — CERTIFICATION EXAM D (mathematics, 100 marks) through the REAL platform, plus the function-study KEY authority: for the
// curriculum function f(x) = (2x − 4)/((x − 1)(x + 2)) an INCOMPLETE key and a WRONG key are refused, the CORRECT key is accepted, the server
// grades a student who reproduces the accepted key at full marks (the key authority and the grader agree), and the AI path cannot bypass the
// validation (its only way into an exam is buildSimFromSpec). Documented limitations of the function analyser are pinned separately.
const require_ = createRequire(import.meta.url);
const { createPlatform } = require_("./platform.js");
const { examOfficialStats } = require_("../../src/lib/exam-structure.js");
const { gradeExam } = require_("../../src/lib/assignment-grading.js");
const codes = r => (r.ok ? [] : r.issues.map(i => i.code));
const study = over => FAKE.funcSim({ tasks: ["domainExclusions", "xIntercepts", "yIntercept", "verticalAsymptotes", "horizontalAsymptotes", "extrema", "monotonicIntervals"],
  extrema: [{ kind: "min", x: 0, y: 2 }, { kind: "max", x: 4, y: 0.2222222222 }],
  intervals: [{ kind: "decreasing", from: "-inf", to: "-2" }, { kind: "decreasing", from: "-2", to: "0" }, { kind: "increasing", from: "0", to: "1" }, { kind: "increasing", from: "1", to: "4" }, { kind: "decreasing", from: "4", to: "+inf" }], ...over });
const STUDENTS = { "d-perfect": "طالب مثالي", "d-partial": "طالب جزئي", "d-second": "طالب محاولة ثانية" };

describe("20G-D mathematics exam — authoring", () => {
  it("finalizable, 100 marks (25 / 15 / 26 / 34), JSON round trip keeps every parametric contract and the function-study key byte-for-byte", () => {
    const e = examD();
    expect(evaluateExamFinalization(e).blockers.map(b => b.message)).toEqual([]);
    const s = examOfficialStats(e);
    expect([s.totalMarks, ...s.sections.map(x => x.totalMarks)]).toEqual([100, 25, 15, 26, 34]);
    const imp = parseStructuredExamJson(JSON.stringify(e), "D.json");
    expect(imp.validationErrors.filter(i => i.severity === "error")).toEqual([]);
    expect(imp.exam.sections.flatMap(x => x.questions)).toEqual(e.sections.flatMap(x => x.questions));
  });
});

describe("20G-D function-study key authority (AI path) — incomplete / wrong / correct", () => {
  it("the CORRECT key (domain, intercepts, asymptotes, extrema, monotonic intervals) is accepted", () => {
    const r = buildSimFromSpec(study({}));
    expect(codes(r)).toEqual([]);
  });
  it("INCOMPLETE keys are refused: a missing exclusion, a missing extremum, a missing interval, a missing asymptote", () => {
    expect(codes(buildSimFromSpec(study({ domainExclusions: [1] })))).toContain("AI_FUNCTION_KEY_INCOMPLETE");
    expect(codes(buildSimFromSpec(study({ extrema: [{ kind: "min", x: 0, y: 2 }] })))).toContain("AI_FUNCTION_KEY_INCOMPLETE");
    expect(codes(buildSimFromSpec(study({ intervals: [{ kind: "decreasing", from: "-inf", to: "-2" }, { kind: "decreasing", from: "-2", to: "0" }, { kind: "increasing", from: "0", to: "1" }, { kind: "increasing", from: "1", to: "4" }] })))).toContain("AI_FUNCTION_KEY_INCOMPLETE");
    expect(codes(buildSimFromSpec(study({ verticalAsymptotes: [1] })))).toContain("AI_FUNCTION_KEY_INCOMPLETE");
  });
  it("WRONG keys are refused: a wrong intercept, a swapped extremum kind, a wrong y-intercept, an asymptote where none exists", () => {
    expect(codes(buildSimFromSpec(study({ xIntercepts: [3] })))).toContain("AI_FUNCTION_KEY_INCONSISTENT");
    expect(codes(buildSimFromSpec(study({ extrema: [{ kind: "max", x: 0, y: 2 }, { kind: "max", x: 4, y: 0.2222222222 }] })))).toContain("AI_FUNCTION_KEY_INCONSISTENT");
    expect(codes(buildSimFromSpec(study({ yIntercept: -2 })))).toContain("AI_FUNCTION_KEY_INCONSISTENT");
    expect(codes(buildSimFromSpec(study({ horizontalAsymptotes: [2] })))).toContain("AI_FUNCTION_KEY_INCONSISTENT");
  });
  it("the server grader AGREES with the accepted key: reproducing it earns full marks; each missing feature costs exactly its weight", () => {
    const r = buildSimFromSpec(study({}));
    if (!r.ok) throw new Error("key refused");
    const q = { examQuestionId: "fs", presentationType: "smartSim", questionTypeVersion: 1, text: "ادرس الدالة", marks: 13, smartSim: r.value.envelope, answer: { scoring: "proportional", checks: r.value.checks } };
    const exam = { examId: "FS", title: "fs", sections: [{ id: "s", title: "s", gradingPolicy: "all", questions: [q] }] };
    const all = [FN.domain, FN.xInt, FN.yInt, FN.va, FN.ha, FN.extrema, FN.intervals];
    const full = gradeExam(exam, { fs: A.sim("functionStudy2d", 1, all) }).questions[0];
    expect([full.score, full.correct]).toEqual([13, true]);
    const weights = Object.fromEntries(r.value.checks.map(c => [c.kind, c.weight]));
    const total = r.value.checks.reduce((n, c) => n + c.weight, 0);
    for (const [i, kind] of [[5, "extrema.points"], [6, "monotonic.intervals"], [0, "domain.exclusions"]]) {
      const without = all.filter((_, j) => j !== i);
      expect(gradeExam(exam, { fs: A.sim("functionStudy2d", 1, without) }).questions[0].score, kind).toBeCloseTo(13 * (total - weights[kind]) / total, 2);
    }
  });
  it("PIN — documented limitations (enterprise-ai-full-exam-composer-20f.md §12): no trigonometry in the closed language; rounding functions are refused for AI keys", () => {
    expect(buildSimFromSpec(study({ source: "sin(x)", tasks: ["xIntercepts"], xIntercepts: [0] })).ok).toBe(false);
    expect(codes(buildSimFromSpec(study({ source: "floor(x)", tasks: ["xIntercepts"], xIntercepts: [0] })))).toContain("AI_FUNCTION_UNSUPPORTED");
  });
});

describe("20G-D mathematics exam — full platform lifecycle", () => {
  let p, aid;
  const runs = {};
  beforeAll(async () => {
    p = createPlatform({ students: STUDENTS });
    aid = (await publishAndAssign(p, examD())).aid;
    runs.PERFECT = await takeExam(p, aid, "d-perfect", PERSONAS.PERFECT.answers, { chunks: 3 });
    runs.PARTIAL = await takeExam(p, aid, "d-partial", PERSONAS.PARTIAL.answers);
  }, 120000);

  it("delivery leaks no parametric expression, no function-study expectation, no check weight; parametric stems are instantiated", () => {
    for (const [name, r] of Object.entries(runs)) {
      expect(scanProjection(r.delivery.jsonBody, { secrets: ["(c-b)/a", "2*a*c+b", "10^k", "t^2-t", "0.2222222222222222", "\"max\",\"x\":4"] }), name).toEqual([]);
      const text = JSON.stringify(r.delivery.jsonBody);
      expect(text, name).not.toMatch(/\{\{[a-z]\}\}/);
    }
  });
  it("ledgers = hand-derived; invariants; the parametric answers computed from the DELIVERED instance earn full marks", () => {
    for (const [name, r] of Object.entries(runs)) {
      expect([r.submit.status, r.duplicateSubmit.status], name).toEqual([200, 409]);
      for (const x of r.restores) expect(x.restored, name).toEqual(x.expected.answers);
      expect(ledgerOf(r.attempt).questions, name).toEqual(PERSONAS[name].auto);
      expect(ledgerOf(r.attempt).parts, name).toEqual(PERSONAS[name].parts);
      expect(attemptInvariants(r.attempt, 100), name).toEqual([]);
    }
  });
  it("teacher review ⇒ FINAL scores", async () => {
    for (const [name, sid] of [["PERFECT", "d-perfect"], ["PARTIAL", "d-partial"]]) {
      const rv = await p.teacher.saveReview(aid, sid, PERSONAS[name].review);
      expect([rv.status, rv.jsonBody.result.score, rv.jsonBody.result.finalized], name).toEqual([200, PERSONAS[name].final, true]);
    }
  });
  it("parametric identity: attempt 2 gets its OWN deterministic instance; answers copied from attempt 1 are graded against attempt 2's values", async () => {
    const s = p.student("d-second");
    await s.start(aid);
    const d1 = (await s.deliver(aid)).jsonBody.assignment.exam;
    await s.submit(aid, PERSONAS.PERFECT.answers(d1));
    await s.start(aid);
    const d2 = (await s.deliver(aid)).jsonBody.assignment.exam;
    const v = (d, qid) => d.sections.flatMap(x => x.questions).find(q => q.examQuestionId === qid).parametric.values;
    const changed = ["d1-6", "d2-1", "d2-2"].filter(q => JSON.stringify(v(d1, q)) !== JSON.stringify(v(d2, q)));
    const sub = await s.submit(aid, PERSONAS.PERFECT.answers(d1), { attemptNumber: 2, startedAt: s.identity(aid).startedAt });
    expect(sub.status).toBe(200);
    const g = ledgerOf(s.attempt(aid, 2)).questions;
    // every question whose instance changed between attempts is graded against the NEW instance (the stale answer earns 0)
    for (const q of changed) expect(g[q], q).toEqual([0, 0]);
    expect(changed.length).toBeGreaterThan(0);
  });
});
